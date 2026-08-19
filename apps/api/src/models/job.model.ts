import { getAsset, panelImage, touchAssets } from "./asset.model";
import type { PanelSource, SourceAnimation } from "./compose.model";
import { type EncodePhase, encodeGif } from "./encoder.model";
import { PanelError } from "./errors";
import {
  computeTimeline,
  DEFAULT_OUTPUT_BUDGET_BYTES,
  MAX_RECOMMENDED_FRAMES,
  makeTiming,
  type Settings,
} from "./timeline.model";
import type { Job, JobPhase } from "./types";

const MAX_CONCURRENT_JOBS = Number(process.env.MAX_CONCURRENT_JOBS ?? 2);
const MAX_QUEUED_JOBS = Number(process.env.MAX_QUEUED_JOBS ?? 8);
const MAX_JOBS = Number(process.env.MAX_JOBS ?? 200);
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS ?? 10 * 60 * 1000);
const OUTPUT_BUDGET_BYTES = Number(process.env.MAX_OUTPUT_BYTES ?? DEFAULT_OUTPUT_BUDGET_BYTES);

/** Hard DoS ceiling. MAX_RECOMMENDED_FRAMES (600) is only a warning. */
const MAX_FRAMES = Number(process.env.MAX_FRAMES ?? 3000);

export const MAX_IMAGES_PER_PANEL = Number(process.env.MAX_IMAGES_PER_PANEL ?? 20);

const jobs = new Map<string, Job>();

// The gate is the composer, not ffmpeg: the JS blend runs on Bun's only thread,
// so more concurrency here just makes every job slower and /health flap.
let running = 0;
const waiting: Array<() => void> = [];

/**
 * Progress is reported per phase; these weights fold it into one 0..1 so the
 * bar never goes backwards. Palette and encode dominate because they both walk
 * the whole timeline.
 */
const PHASE_WEIGHTS: Record<EncodePhase | "decoding", [number, number]> = {
  decoding: [0, 0.05],
  palette: [0.05, 0.4],
  encoding: [0.4, 0.8],
  optimizing: [0.8, 0.88],
  // Reserved for budget retries. Most jobs never enter it and jump from 0.88
  // straight to done.
  shrinking: [0.88, 0.99],
};

export interface CreateJobInput {
  right: string[];
  left: string[];
  settings: Settings;
  acknowledgeFrames?: boolean;
}

export function createJob(sessionId: string, input: CreateJobInput): Job {
  const timeline = computeTimeline(input.right.length, input.left.length, input.settings);

  if (timeline.totalFrames > MAX_FRAMES) {
    throw new PanelError(413, "framesTooMany", "Too many frames to encode", {
      frames: timeline.totalFrames,
      max: MAX_FRAMES,
    });
  }
  // Soft guard. The client shows a dialog for this; sending the ack is what
  // makes that dialog un-bypassable by accident rather than decorative.
  if (timeline.totalFrames > MAX_RECOMMENDED_FRAMES && input.acknowledgeFrames !== true) {
    throw new PanelError(409, "framesExceeded", "Frame count above the recommended maximum", {
      frames: timeline.totalFrames,
      max: MAX_RECOMMENDED_FRAMES,
    });
  }

  // Resolve every asset before queueing, so a bad id fails fast instead of
  // occupying a slot and then dying.
  for (const id of [...input.right, ...input.left]) getAsset(id, sessionId);

  if (waiting.length >= MAX_QUEUED_JOBS) {
    throw new PanelError(503, "serverBusy", "Encoder queue is full", {
      queued: waiting.length,
      max: MAX_QUEUED_JOBS,
    });
  }
  if (jobs.size >= MAX_JOBS) sweep(true);

  const job: Job = {
    id: crypto.randomUUID(),
    sessionId,
    status: "queued",
    phase: "queued",
    progress: 0,
    settings: input.settings,
    rightIds: [...input.right],
    leftIds: [...input.left],
    totalFrames: timeline.totalFrames,
    keptFrames: null,
    width: timeline.atlasW,
    height: timeline.atlasH,
    loopSeconds: timeline.totalLoopSeconds,
    result: null,
    bytes: null,
    budgetBytes: OUTPUT_BUDGET_BYTES,
    degradation: null,
    error: null,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    abort: new AbortController(),
    listeners: new Set(),
  };
  jobs.set(job.id, job);

  void run(job);
  return job;
}

export function getJob(id: string, sessionId: string): Job {
  const job = jobs.get(id);
  if (!job || job.sessionId !== sessionId) {
    throw new PanelError(404, "jobNotFound", "Job not found");
  }
  job.lastSeenAt = Date.now();
  return job;
}

export function cancelJob(id: string, sessionId: string): void {
  const job = getJob(id, sessionId);
  if (job.status === "done" || job.status === "failed" || job.status === "canceled") {
    jobs.delete(id);
    return;
  }
  job.abort.abort();
  settle(job, "canceled", { code: "jobCanceled", message: "Job canceled" });
}

export function resultOf(id: string, sessionId: string): Uint8Array {
  const job = getJob(id, sessionId);
  if (job.status === "failed") {
    throw new PanelError(
      409,
      job.error?.code ?? "jobFailed",
      job.error?.message ?? "Job failed",
      job.error?.params,
    );
  }
  if (job.status !== "done" || !job.result) {
    throw new PanelError(409, "jobNotReady", "Job is not finished yet", { status: job.status });
  }
  return job.result;
}

function notify(job: Job): void {
  for (const listener of job.listeners) listener();
}

function setProgress(job: Job, phase: JobPhase, ratio: number): void {
  const weight = PHASE_WEIGHTS[phase as EncodePhase | "decoding"];
  if (weight) {
    const [from, to] = weight;
    const next = from + (to - from) * Math.min(1, Math.max(0, ratio));
    // Monotonic: a phase restarting must not rewind the bar.
    job.progress = Math.max(job.progress, next);
  }
  job.phase = phase;
  notify(job);
}

function settle(job: Job, status: Job["status"], error: Job["error"] = null): void {
  if (job.status === "done" || job.status === "failed" || job.status === "canceled") return;
  job.status = status;
  job.phase = "settled";
  job.error = error;
  if (status === "done") job.progress = 1;
  job.lastSeenAt = Date.now();
  notify(job);
}

async function acquire(): Promise<void> {
  if (running < MAX_CONCURRENT_JOBS) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
}

function release(): void {
  running--;
  waiting.shift()?.();
}

async function run(job: Job): Promise<void> {
  await acquire();
  try {
    if (job.abort.signal.aborted) return;
    job.status = "running";
    setProgress(job, "decoding", 0);

    const timeline = computeTimeline(job.rightIds.length, job.leftIds.length, job.settings);
    const right = await loadPanel(job, job.rightIds, timeline.panelW, timeline.panelH);
    const left = await loadPanel(job, job.leftIds, timeline.panelW, timeline.panelH);
    setProgress(job, "decoding", 1);

    const encoded = await encodeGif({
      jobId: job.id,
      timeline,
      settings: job.settings,
      right,
      left,
      onProgress: (phase, ratio) => setProgress(job, phase, ratio),
      signal: job.abort.signal,
    });

    job.result = encoded.gif;
    job.bytes = encoded.gif.byteLength;
    job.keptFrames = encoded.keptFrames;
    if (encoded.degradedSteps > 0) {
      // fps can change, which moves the frame count and the loop length — the
      // view has to report what was actually produced, not what was asked for.
      job.totalFrames = encoded.timeline.totalFrames;
      job.loopSeconds = encoded.timeline.totalLoopSeconds;
      job.degradation = {
        gifQuality: encoded.settings.gifQuality,
        fps: encoded.settings.fps,
        skipSimilarity: encoded.settings.skipSimilarity,
        steps: encoded.degradedSteps,
      };
    }
    touchAssets([...job.rightIds, ...job.leftIds]);
    settle(job, "done");
  } catch (err) {
    if (job.abort.signal.aborted) {
      settle(job, "canceled", { code: "jobCanceled", message: "Job canceled" });
    } else if (err instanceof PanelError) {
      settle(job, "failed", { code: err.code, message: err.message, params: err.params });
    } else {
      console.error("Job failed:", err);
      settle(job, "failed", { code: "encodeFailed", message: "Encoding failed" });
    }
  } finally {
    release();
  }
}

async function loadPanel(
  job: Job,
  ids: readonly string[],
  width: number,
  height: number,
): Promise<PanelSource> {
  const images: SourceAnimation[] = [];
  let opaque = true;
  for (const [i, id] of ids.entries()) {
    const asset = getAsset(id, job.sessionId);
    const resized = await panelImage(asset, width, height);
    images.push({ frames: resized.frames, timing: makeTiming(resized.delaysMs) });
    opaque &&= resized.opaque;
    setProgress(job, "decoding", (i + 1) / (ids.length * 2));
  }
  return { images, opaque };
}

function sweep(force = false): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    const idle = job.lastSeenAt <= cutoff;
    const finished = job.status === "done" || job.status === "failed" || job.status === "canceled";
    if (idle || (force && finished)) {
      if (!finished) job.abort.abort();
      jobs.delete(id);
    }
  }
}

export function jobStats(): { total: number; running: number; queued: number } {
  return { total: jobs.size, running, queued: waiting.length };
}

export function startJobJanitor(): void {
  const timer = setInterval(() => sweep(), 5 * 60 * 1000);
  timer.unref?.();
}

export { MAX_FRAMES, MAX_QUEUED_JOBS };
