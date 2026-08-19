import { createAsset, removeAsset } from "../models/asset.model";
import { type AssetView, presentAsset } from "../views/asset.view";

export const assetController = {
  async upload(sessionId: string, input: { file: File }): Promise<AssetView> {
    return presentAsset(await createAsset(sessionId, input.file));
  },

  remove(sessionId: string, id: string): void {
    removeAsset(id, sessionId);
  },
};
