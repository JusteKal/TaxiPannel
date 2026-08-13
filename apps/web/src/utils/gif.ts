import { PANEL_HEIGHT, PANEL_WIDTH } from "@taxipannel/api/timeline";
import { decompressFrames, type ParsedFrame, parseGIF } from "gifuct-js";

// Mirrors MAX_SOURCE_FRAMES on the API. A source truncated here but not there
// would make the preview and the export disagree.
const MAX_SOURCE_FRAMES = 120;

export interface DecodedSource {
  /** Already at panel geometry, so the preview and the encoder resize identically. */
  frames: ImageBitmap[];
  /** Raw per-frame delays in ms. Empty for a still. Normalised by makeTiming(). */
  delaysMs: number[];
  truncated: boolean;
}

/**
 * `createImageBitmap` on a GIF yields the FIRST frame only, so an animated
 * source has to be decoded by hand. gifuct hands back per-frame *patches* with
 * their own offset and a disposal mode; libvips composes them internally, so
 * the same composition has to happen here or the preview lies about the export.
 *
 * Both width and height are passed to resize, which disables aspect
 * preservation — that is the same squash as sharp's `fit: "fill"`.
 */
export async function decodeSource(file: File): Promise<DecodedSource> {
  if (file.type !== "image/gif") {
    return { frames: [await toPanelBitmap(file)], delaysMs: [], truncated: false };
  }

  // Annotated rather than inferred: decompressFrames is overloaded on its
  // second argument and ReturnType<> picks the last overload, the one without
  // the `patch` we need.
  let parsed: ParsedFrame[];
  let width: number;
  let height: number;
  let declared: number;
  try {
    const gif = parseGIF(await file.arrayBuffer());
    const all = decompressFrames(gif, true);
    declared = all.length;
    parsed = all.slice(0, MAX_SOURCE_FRAMES);
    width = gif.lsd.width;
    height = gif.lsd.height;
  } catch {
    // A GIF we cannot parse still has a first frame the browser can decode.
    return { frames: [await toPanelBitmap(file)], delaysMs: [], truncated: false };
  }

  if (parsed.length <= 1 || width <= 0 || height <= 0) {
    return { frames: [await toPanelBitmap(file)], delaysMs: [], truncated: false };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const patch = document.createElement("canvas");
  const patchCtx = patch.getContext("2d")!;

  const frames: ImageBitmap[] = [];
  const delaysMs: number[] = [];
  let clearAfter: { x: number; y: number; w: number; h: number } | null = null;
  let restoreAfter: ImageData | null = null;

  for (const frame of parsed) {
    // Disposal applies to the frame BEFORE the next one is drawn, which is why
    // it is handled at the top of the following iteration.
    if (restoreAfter) {
      ctx.putImageData(restoreAfter, 0, 0);
      restoreAfter = null;
    } else if (clearAfter) {
      ctx.clearRect(clearAfter.x, clearAfter.y, clearAfter.w, clearAfter.h);
      clearAfter = null;
    }

    const { width: fw, height: fh, left, top } = frame.dims;
    // 3 = restore to previous: snapshot before drawing, not after.
    if (frame.disposalType === 3) restoreAfter = ctx.getImageData(0, 0, width, height);

    patch.width = fw;
    patch.height = fh;
    // createImageData + set() rather than the ImageData constructor: gifuct's
    // patch is a Uint8ClampedArray<ArrayBufferLike>, which TS will not accept
    // as the constructor's ArrayBuffer-backed ImageDataArray.
    const patchData = patchCtx.createImageData(fw, fh);
    patchData.data.set(frame.patch);
    patchCtx.putImageData(patchData, 0, 0);
    ctx.drawImage(patch, left, top);

    frames.push(await toPanelBitmap(canvas));
    delaysMs.push(frame.delay);

    // 2 = restore to background colour, which for a transparent GIF means clear.
    if (frame.disposalType === 2) clearAfter = { x: left, y: top, w: fw, h: fh };
  }

  return { frames, delaysMs, truncated: declared > frames.length };
}

function toPanelBitmap(source: ImageBitmapSource): Promise<ImageBitmap> {
  return createImageBitmap(source, {
    resizeWidth: PANEL_WIDTH,
    resizeHeight: PANEL_HEIGHT,
    resizeQuality: "high",
  });
}

export { MAX_SOURCE_FRAMES };
