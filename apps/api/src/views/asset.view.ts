import type { Asset } from "../models/types";

export interface AssetView {
  id: string;
  name: string;
  width: number;
  height: number;
  size: number;
  /** 1 for a still image. Lets the client badge animated sources. */
  frames: number;
}

/** The projection choke point: `sessionId` and the raw bytes never leave here. */
export function presentAsset(asset: Asset): AssetView {
  return {
    id: asset.id,
    name: asset.name,
    width: asset.width,
    height: asset.height,
    size: asset.size,
    frames: asset.frames,
  };
}
