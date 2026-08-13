import sharp from "sharp";
import { PanelError } from "./errors";

// Guards against a decompression bomb BEFORE libvips allocates the pixel buffer.
// A 10 KB PNG can declare 50000x50000.
const MAX_IMAGE_PIXELS = Number(process.env.MAX_IMAGE_PIXELS ?? 40_000_000);

export interface PanelImage {
  /** Straight (non-premultiplied) RGBA, width * height * 4 bytes. */
  data: Uint8Array;
  opaque: boolean;
}

export interface ImageProbe {
  width: number;
  height: number;
  format: string;
}

export async function probe(bytes: Uint8Array): Promise<ImageProbe> {
  try {
    const meta = await sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
    if (!meta.width || !meta.height || !meta.format) throw new Error("no dimensions");
    return { width: meta.width, height: meta.height, format: meta.format };
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
  try {
    raw = await sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS })
      // The browser applied EXIF orientation for free when it decoded into
      // an <img>. Without this, phone photos come out rotated.
      .rotate()
      .resize(width, height, { fit, kernel: "lanczos3" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new PanelError(415, "unsupportedImage", "Unsupported or corrupt image");
  }

  if (raw.info.width !== width || raw.info.height !== height) {
    throw new PanelError(500, "internal", "Resize produced unexpected dimensions");
  }

  const data = new Uint8Array(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength);
  return { data, opaque: isOpaque(data) };
}

function isOpaque(data: Uint8Array): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return false;
  }
  return true;
}

/** Debug helper: turn a raw RGBA buffer back into a PNG. Used by the fixture scripts. */
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
