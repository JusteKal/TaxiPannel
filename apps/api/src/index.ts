import { app } from "./app";
import { startRateLimitJanitor } from "./middleware/rate-limit";
import { startAssetJanitor } from "./models/asset.model";
import { checkEncoders, ensureTmpDir } from "./models/encoder.model";
import { startJobJanitor } from "./models/job.model";

// The public type barrel. apps/web imports from "@taxipannel/api", never from a
// deep path — one seam to change. Values live behind the "./timeline" subpath
// so importing them does not boot the janitors below.
export type { AppType } from "./app";
export type { PanelErrorBody, PanelErrorCode, PanelErrorParams } from "./models/errors";
export type { CreateJobInput } from "./models/job.model";
export type { Settings, Timeline } from "./models/timeline.model";
export type { JobPhase, JobStatus } from "./models/types";
export type { AssetView } from "./views/asset.view";
export type { JobView } from "./views/job.view";

await ensureTmpDir();
startAssetJanitor();
startJobJanitor();
startRateLimitJanitor();

const encoders = await checkEncoders();
if (!encoders.ffmpeg || !encoders.gifsicle) {
  // Not fatal: /health answers 503 and every job fails with `encoderMissing`,
  // which is a far more legible failure than a container that refuses to boot.
  console.warn(
    `Encoders missing (ffmpeg=${encoders.ffmpeg}, gifsicle=${encoders.gifsicle}). ` +
      "Jobs will fail until they are installed.",
  );
}

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
