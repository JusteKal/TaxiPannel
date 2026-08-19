import sharp from "sharp";
import { PanelError } from "./errors";

// Guards against a decompression bomb BEFORE libvips allocates the pixel buffer.
// A 10 KB PNG can declare 50000x50000.
const MAX_IMAGE_PIXELS = Number(process.env.MAX_IMAGE_PIXELS ?? 40_000_000);

// An animated source is held decoded, at panel size, for the whole job: one
// frame is 256*128*4 = 128 KiB, so a 300-frame GIF would be 38 MiB per panel
// slot. Long animations are truncated rather than refused — the first seconds
// are what ends up on the roof anyway.
const MAX_SOURCE_FRAMES = Number(process.env.MAX_SOURCE_FRAMES ?? 120);

export interface PanelImage {
  /** One straight (non-premultiplied) RGBA buffer per frame, width * height * 4. */
  frames: Uint8Array[];
  /** Per-frame delay in ms, as declared by the source. Empty for a still image. */
  delaysMs: number[];
  opaque: boolean;
  /** True when the source declared more frames than MAX_SOURCE_FRAMES. */
  truncated: boolean;
}

export interface ImageProbe {
  width: number;
  height: number;
  format: string;
  /** Frame count as declared by the source, before truncation. */
  frames: number;
}

export async function probe(bytes: Uint8Array): Promise<ImageProbe> {
  try {
    const meta = await sharp(bytes, {
      animated: true,
      limitInputPixels: MAX_IMAGE_PIXELS,
    }).metadata();
    if (!meta.width || !meta.format) throw new Error("no dimensions");
    const pages = meta.pages ?? 1;
    // With animated:true, `height` is the whole filmstrip; pageHeight is the
    // real frame height.
    const height = meta.pageHeight ?? meta.height;
    if (!height) throw new Error("no dimensions");
    return { width: meta.width, height, format: meta.format, frames: pages };
  } catch {
    throw new PanelError(415, "unsupportedImage", "Unsupported or corrupt image");
  }
}

/**
 * `fit: "fill"` is the load-bearing bit: it reproduces the old
 * drawImage(img, 0, 0, w, h), which squashed the source into the panel box and
 * did NOT preserve aspect ratio. The parameter is threaded through so that
 * adding a 7th "fit" setting later is a form field, not a refactor.
 */
export type PanelFit = "fill" | "cover" | "contain";

export async function resizeToPanel(
  bytes: Uint8Array,
  width: number,
  height: number,
  fit: PanelFit = "fill",
): Promise<PanelImage> {
  let raw: { data: Buffer; info: sharp.OutputInfo };
  let delaysMs: number[] = [];
  let declaredFrames = 1;

  try {
    // animated:true also decodes stills correctly — pages is simply 1 — so
    // there is no branch on format anywhere in this file.
    const meta = await sharp(bytes, {
      animated: true,
      limitInputPixels: MAX_IMAGE_PIXELS,
    }).metadata();
    declaredFrames = meta.pages ?? 1;
    delaysMs = declaredFrames > 1 ? [...(meta.delay ?? [])] : [];

    const pages = Math.min(declaredFrames, MAX_SOURCE_FRAMES);
    raw = await sharp(bytes, {
      animated: true,
      limitInputPixels: MAX_IMAGE_PIXELS,
      // `pages` truncates the filmstrip at decode time, so a 500-frame GIF
      // never materialises in memory at all.
      pages,
    })
      // The browser applied EXIF orientation for free when it decoded into
      // an <img>. Without this, phone photos come out rotated.
      // Only meaningful for stills; libvips ignores it for multi-page input.
      .rotate()
      .resize(width, height, { fit, kernel: "lanczos3" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    delaysMs = delaysMs.slice(0, pages);
  } catch {
    throw new PanelError(415, "unsupportedImage", "Unsupported or corrupt image");
  }

  const frameBytes = width * height * 4;
  if (raw.data.byteLength % frameBytes !== 0 || raw.info.width !== width) {
    throw new PanelError(500, "internal", "Resize produced unexpected dimensions");
  }

  const count = raw.data.byteLength / frameBytes;
  const frames: Uint8Array[] = [];
  let opaque = true;
  for (let i = 0; i < count; i++) {
    const frame = new Uint8Array(raw.data.buffer, raw.data.byteOffset + i * frameBytes, frameBytes);
    frames.push(frame);
    if (opaque) opaque = isOpaque(frame);
  }

  return {
    frames,
    delaysMs: count > 1 ? delaysMs : [],
    opaque,
    truncated: declaredFrames > count,
  };
}

function isOpaque(data: Uint8Array): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return false;
  }
  return true;
}

/** Debug helper: turn a raw RGBA buffer back into a PNG. Used by fixture scripts. */
export async function rawToPng(
  data: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const png = await sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  return new Uint8Array(png);
}

export { MAX_SOURCE_FRAMES };
