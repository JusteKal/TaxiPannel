import { PanelError } from "./errors";
import { type PanelImage, probe, resizeToPanel } from "./image.model";
import type { Asset } from "./types";

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 12 * 1024 * 1024);
const MAX_ASSETS_PER_SESSION = Number(process.env.MAX_ASSETS_PER_SESSION ?? 40);
const ASSET_TTL_MS = Number(process.env.ASSET_TTL_MS ?? 30 * 60 * 1000);

// All state is in-process. One replica only — two would hand a client an asset
// id the other has never heard of.
const assets = new Map<string, Asset>();

export async function createAsset(sessionId: string, file: File): Promise<Asset> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new PanelError(413, "imageTooLarge", "Image too large", {
      max: MAX_UPLOAD_BYTES,
      size: file.size,
    });
  }

  let owned = 0;
  for (const asset of assets.values()) {
    if (asset.sessionId === sessionId) owned++;
  }
  if (owned >= MAX_ASSETS_PER_SESSION) {
    throw new PanelError(409, "tooManyAssets", "Too many images in this session", {
      max: MAX_ASSETS_PER_SESSION,
    });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const meta = await probe(bytes);

  // Refused on the format and not only on the page count: a single-frame GIF
  // would pass `frames > 1` and still ship an indexed 256-colour source.
  if (meta.format === "gif" || meta.frames > 1) {
    throw new PanelError(415, "staticImageOnly", "Only still images are accepted", {
      name: file.name || "image",
    });
  }

  const asset: Asset = {
    id: crypto.randomUUID(),
    sessionId,
    name: file.name || "image",
    width: meta.width,
    height: meta.height,
    frames: meta.frames,
    bytes,
    size: bytes.byteLength,
    createdAt: Date.now(),
    resized: new Map(),
  };
  assets.set(asset.id, asset);
  return asset;
}

export function getAsset(id: string, sessionId: string): Asset {
  const asset = assets.get(id);
  // Same 404 for "does not exist" and "belongs to someone else": an id oracle
  // would let a caller enumerate other sessions' uploads.
  if (!asset || asset.sessionId !== sessionId) {
    throw new PanelError(404, "assetNotFound", "Asset not found");
  }
  return asset;
}

export function removeAsset(id: string, sessionId: string): void {
  getAsset(id, sessionId);
  assets.delete(id);
}

export function touchAssets(ids: readonly string[]): void {
  const now = Date.now();
  for (const id of ids) {
    const asset = assets.get(id);
    if (asset) asset.createdAt = now;
  }
}

/** Resized panels are memoised per geometry so regenerating at the same scale is free. */
export async function panelImage(asset: Asset, width: number, height: number): Promise<PanelImage> {
  const key = `${width}x${height}`;
  const cached = asset.resized.get(key);
  if (cached) return cached;
  const resized = await resizeToPanel(asset.bytes, width, height);
  asset.resized.set(key, resized);
  return resized;
}

export function assetCount(): number {
  return assets.size;
}

export function startAssetJanitor(): void {
  const timer = setInterval(
    () => {
      const cutoff = Date.now() - ASSET_TTL_MS;
      for (const [id, asset] of assets) {
        if (asset.createdAt <= cutoff) assets.delete(id);
      }
    },
    5 * 60 * 1000,
  );
  timer.unref?.();
}

export { MAX_ASSETS_PER_SESSION, MAX_UPLOAD_BYTES };
