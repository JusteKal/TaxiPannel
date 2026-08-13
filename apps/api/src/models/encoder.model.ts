import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { changedRatio, makeScratch, type PanelSource, renderAtlasAt } from "./compose.model";
import { PanelError } from "./errors";
import { encodeQuality, type Settings, type Timeline } from "./timeline.model";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const GIFSICLE = process.env.GIFSICLE_PATH ?? "gifsicle";
const TMP_DIR = process.env.TMP_DIR ?? "/tmp/taxipannel";
const JOB_TIMEOUT_MS = Number(process.env.JOB_TIMEOUT_MS ?? 120_000);

// The composer runs on Bun's only thread. Yielding every N frames keeps the SSE
// stream and /health answering while a 600-frame job grinds.
const YIELD_EVERY = 16;

export type EncodePhase = "palette" | "encoding" | "optimizing";

export interface EncodeRequest {
  jobId: string;
  timeline: Timeline;
  settings: Settings;
  right: PanelSource;
  left: PanelSource;
  onProgress: (phase: EncodePhase, ratio: number) => void;
  signal: AbortSignal;
}

export interface EncodeResult {
  gif: Uint8Array;
  keptFrames: number;
}

/** A frame that survived deduplication, and how long it is held for. */
interface Kept {
  index: number;
  delayMs: number;
}

interface Live {
  kill(signal?: NodeJS.Signals | number): void;
}

interface Context extends EncodeRequest {
  dir: string;
  paletteFile: string;
  workFile: string;
  atlas: Uint8Array;
  spare: Uint8Array;
  scratch: ReturnType<typeof makeScratch>;
  live: Set<Live>;
}

export async function encodeGif(req: EncodeRequest): Promise<EncodeResult> {
  const dir = join(TMP_DIR, req.jobId);
  await mkdir(dir, { recursive: true });

  const ctx: Context = {
    ...req,
    dir,
    paletteFile: join(dir, "palette.png"),
    workFile: join(dir, "work.gif"),
    // Double-buffered: only two atlas frames are ever alive, regardless of how
    // many frames the loop has. This is what keeps a 600-frame job at ~2 MB.
    atlas: new Uint8Array(req.timeline.atlasBytes),
    spare: new Uint8Array(req.timeline.atlasBytes),
    scratch: makeScratch(req.timeline),
    live: new Set(),
  };

  let timedOut = false;
  const killAll = () => {
    for (const p of ctx.live) p.kill("SIGKILL");
  };
  const onAbort = () => killAll();
  const timer = setTimeout(() => {
    timedOut = true;
    killAll();
  }, JOB_TIMEOUT_MS);
  req.signal.addEventListener("abort", onAbort, { once: true });

  try {
    const kept = await passPalette(ctx);
    await passEncode(ctx, kept);
    const gif = await passOptimise(ctx, kept);
    return { gif, keptFrames: kept.length };
  } catch (err) {
    if (timedOut) {
      throw new PanelError(500, "encodeTimeout", "Encoding timed out", {
        seconds: Math.round(JOB_TIMEOUT_MS / 1000),
      });
    }
    // 409 and not nginx's 499: this rarely reaches the wire at all — the job
    // transitions to "canceled" and the SSE stream reports it — but when it
    // does it has to be a status Hono will actually accept.
    if (req.signal.aborted) throw new PanelError(409, "jobCanceled", "Job canceled");
    throw err;
  } finally {
    clearTimeout(timer);
    req.signal.removeEventListener("abort", onAbort);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Two helpers rather than one with a boolean, so `proc.stdin` is a FileSink and
// not `FileSink | undefined` at every call site.
function spawnPiped(ctx: Context, bin: string, args: string[]) {
  const proc = guard(bin, () =>
    Bun.spawn([bin, ...args], {
      stdin: "pipe",
      stdout: "ignore",
      // stderr MUST be drained: ffmpeg blocks on a full stderr pipe, which would
      // deadlock against our stdin writes.
      stderr: "pipe",
    }),
  );
  ctx.live.add(proc);
  return { proc, stdin: proc.stdin, stderr: new Response(proc.stderr).text() };
}

function spawnPlain(ctx: Context, bin: string, args: string[]) {
  const proc = guard(bin, () =>
    Bun.spawn([bin, ...args], { stdin: "ignore", stdout: "ignore", stderr: "pipe" }),
  );
  ctx.live.add(proc);
  return { proc, stderr: new Response(proc.stderr).text() };
}

function guard<T>(bin: string, spawn: () => T): T {
  try {
    return spawn();
  } catch {
    // A missing binary is an operator problem, not a bad request — say so
    // instead of reporting it as a generic encode failure.
    throw new PanelError(503, "encoderMissing", `${bin} is not installed`, { binary: bin });
  }
}

async function writeFrame(sink: Bun.FileSink, frame: Uint8Array): Promise<void> {
  sink.write(frame);
  // flush() returns a number when the write already landed and a Promise when
  // the pipe is full. Awaiting a number is a no-op, so this is both correct
  // backpressure and free on the fast path.
  await sink.flush();
}

async function settle(
  ctx: Context,
  proc: Bun.Subprocess,
  stderr: Promise<string>,
  what: string,
): Promise<void> {
  const code = await proc.exited;
  ctx.live.delete(proc);
  if (code !== 0) {
    const detail = (await stderr).trim().split("\n").slice(-3).join(" | ").slice(0, 400);
    throw new PanelError(500, "encodeFailed", `${what} exited ${code}: ${detail}`);
  }
}

/**
 * Pass A — plan the deduplication and build the palette in one sweep.
 *
 * palettegen only emits its palette frame at EOF, so the single-pass
 * split[a][b];[a]palettegen[p];[b][p]paletteuse filtergraph has to buffer the
 * WHOLE decimated stream inside the split — ~314 MB for 600 frames, per job.
 * Two passes is O(1) in frame count; regenerating the frames for pass B is pure
 * memcpy off already-decoded sources.
 *
 * Feeding palettegen only the kept frames is also the correct statistical
 * weighting: each held image counts once, each fade step counts once.
 */
async function passPalette(ctx: Context): Promise<Kept[]> {
  const { timeline, settings } = ctx;
  const { colors } = encodeQuality(settings.gifQuality);

  const { proc, stdin, stderr } = spawnPiped(ctx, FFMPEG, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgba",
    "-video_size",
    `${timeline.atlasW}x${timeline.atlasH}`,
    "-framerate",
    String(settings.fps),
    "-i",
    "-",
    // rgba -> rgb24 drops the alpha byte without compositing, which is exactly
    // what gif.js did (it read unpremultiplied ImageData and ignored `a`).
    // reserve_transparent=0: the atlas is opaque, a reserved slot would waste
    // one of the 256 colours on something we never emit.
    "-vf",
    `format=rgb24,palettegen=max_colors=${colors}:stats_mode=full:reserve_transparent=0`,
    "-frames:v",
    "1",
    "-y",
    ctx.paletteFile,
  ]);

  const kept: Kept[] = [];
  const frameDelay = timeline.frameDelayMs;
  let prev: Uint8Array | null = null;
  let prevIndex = 0;
  let pending = 0;
  let cur = ctx.atlas;
  let other = ctx.spare;

  for (let i = 0; i < timeline.totalFrames; i++) {
    renderAtlasAt(cur, i, timeline, ctx.right, ctx.left, ctx.scratch);

    if (prev === null) {
      prev = cur;
      prevIndex = i;
      pending = frameDelay;
      [cur, other] = [other, cur];
    } else if (changedRatio(prev, cur) * 100 < settings.skipSimilarity) {
      // Frame dropped: its delay is merged into the one before it.
      pending += frameDelay;
    } else {
      kept.push({ index: prevIndex, delayMs: pending });
      await writeFrame(stdin, prev);
      prev = cur;
      prevIndex = i;
      pending = frameDelay;
      [cur, other] = [other, cur];
    }

    if (i % YIELD_EVERY === 0) {
      ctx.onProgress("palette", i / timeline.totalFrames);
      await Bun.sleep(0);
    }
  }

  if (prev !== null) {
    kept.push({ index: prevIndex, delayMs: pending });
    await writeFrame(stdin, prev);
  }

  stdin.end();
  await settle(ctx, proc, stderr, "ffmpeg (palettegen)");
  ctx.onProgress("palette", 1);
  return kept;
}

/** Pass B — replay the kept frames through paletteuse. Output goes to a file, so
 *  there is no stdout to drain and no deadlock surface at all. */
async function passEncode(ctx: Context, kept: Kept[]): Promise<void> {
  const { timeline, settings } = ctx;

  const { proc, stdin, stderr } = spawnPiped(ctx, FFMPEG, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgba",
    "-video_size",
    `${timeline.atlasW}x${timeline.atlasH}`,
    "-framerate",
    String(settings.fps),
    "-i",
    "-",
    "-i",
    ctx.paletteFile,
    // dither=none is the faithful choice: gif.js's NeuQuant did nearest-colour
    // mapping with no dithering. It is also the right call for flat
    // advertising art, and it compresses far better.
    "-filter_complex",
    "[0:v]format=rgb24[v];[v][1:v]paletteuse=dither=none[out]",
    "-map",
    "[out]",
    "-loop",
    "0",
    "-f",
    "gif",
    "-y",
    ctx.workFile,
  ]);

  for (let k = 0; k < kept.length; k++) {
    renderAtlasAt(ctx.atlas, kept[k]!.index, timeline, ctx.right, ctx.left, ctx.scratch);
    await writeFrame(stdin, ctx.atlas);
    if (k % YIELD_EVERY === 0) {
      ctx.onProgress("encoding", k / kept.length);
      await Bun.sleep(0);
    }
  }

  stdin.end();
  await settle(ctx, proc, stderr, "ffmpeg (paletteuse)");
  ctx.onProgress("encoding", 1);
}

/**
 * Pass C — gifsicle rewrites the per-frame delays and optimises in place.
 *
 * ffmpeg emitted a constant framerate, so the deduplicated frames still carry
 * uniform delays; this is where the merged delays actually land. Batch mode
 * needs a seekable input, and piping both ways would mean draining stdout while
 * writing stdin — so a temp file, not a pipe.
 */
async function passOptimise(ctx: Context, kept: Kept[]): Promise<Uint8Array> {
  const { lossy } = encodeQuality(ctx.settings.gifQuality);
  ctx.onProgress("optimizing", 0);

  const args = [
    "--no-warnings",
    "-b", // batch: rewrite workFile in place
    "-O3",
    // gif.js used repeat: 0. gifsicle can drop the Netscape looping block when
    // it rebuilds, so the loop is restated rather than assumed.
    "--loopcount=forever",
    ...(lossy > 0 ? [`--lossy=${lossy}`] : []),
    // No --colors: palettegen already owns palette size. Two owners means
    // double quantisation and a worse result than either alone.
    ctx.workFile,
    ...delayArgs(kept),
  ];

  const { proc, stderr } = spawnPlain(ctx, GIFSICLE, args);
  await settle(ctx, proc, stderr, "gifsicle");

  const gif = new Uint8Array(await Bun.file(ctx.workFile).arrayBuffer());
  ctx.onProgress("optimizing", 1);
  return gif;
}

/**
 * GIF stores delays in centiseconds, and 12 fps is 83.33 ms — which is not a
 * whole number of centiseconds. Rounding each frame independently (what gif.js
 * did) loses ~3 ms per frame, so a 21.60 s loop shipped as 20.72 s. The residual
 * is carried instead: each delay is derived from the running ideal total, so the
 * loop lands on round(totalMs / 10) exactly while no individual frame moves by
 * more than one centisecond.
 */
export function toCentiseconds(kept: readonly Kept[]): number[] {
  const out: number[] = [];
  let idealMs = 0;
  let emitted = 0;
  for (const k of kept) {
    idealMs += k.delayMs;
    // Delay 0 means "as fast as possible" and browsers clamp it unpredictably.
    const cs = Math.max(1, Math.round(idealMs / 10) - emitted);
    emitted += cs;
    out.push(cs);
  }
  return out;
}

/**
 * gifsicle takes the delay option BEFORE the frame selection it applies to, and
 * both after the input file: `gifsicle -b a.gif -d50 "#0-3" -d100 "#4"`.
 * Runs of equal delay are collapsed into ranges, so a typical clip needs a
 * couple of dozen arguments rather than one pair per frame.
 */
export function delayArgs(kept: readonly Kept[]): string[] {
  if (kept.length === 0) return [];
  const cs = toCentiseconds(kept);
  const args: string[] = [];
  let start = 0;
  for (let i = 1; i <= cs.length; i++) {
    if (i === cs.length || cs[i] !== cs[start]) {
      args.push(`-d${cs[start]}`, start === i - 1 ? `#${start}` : `#${start}-${i - 1}`);
      start = i;
    }
  }
  return args;
}

export interface EncoderAvailability {
  ffmpeg: boolean;
  gifsicle: boolean;
}

export async function checkEncoders(): Promise<EncoderAvailability> {
  const probe = async (bin: string, arg: string) => {
    try {
      const proc = Bun.spawn([bin, arg], { stdout: "ignore", stderr: "ignore" });
      return (await proc.exited) === 0;
    } catch {
      return false;
    }
  };
  const [ffmpeg, gifsicle] = await Promise.all([
    probe(FFMPEG, "-version"),
    probe(GIFSICLE, "--version"),
  ]);
  return { ffmpeg, gifsicle };
}

export async function ensureTmpDir(): Promise<void> {
  await mkdir(TMP_DIR, { recursive: true });
}

export { TMP_DIR };
