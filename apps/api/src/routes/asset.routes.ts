import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { assetController } from "../controllers/asset.controller";
import { rateLimit } from "../middleware/rate-limit";
import { requireSessionId } from "../middleware/session";
import { MAX_UPLOAD_BYTES } from "../models/asset.model";
import { PanelError } from "../models/errors";

const UPLOAD_LIMIT_PER_10MIN = Number(process.env.UPLOAD_LIMIT_PER_10MIN ?? 200);

const uploadSchema = z.object({ file: z.instanceof(File) });

function onInvalid(result: { success: boolean }): void {
  // Funnels Zod failures into the same envelope as everything else, instead of
  // leaking an issue tree the client has no way to translate.
  if (!result.success) {
    throw new PanelError(400, "invalidRequest", "Invalid request payload");
  }
}

const uploadLimit = rateLimit({
  limit: UPLOAD_LIMIT_PER_10MIN,
  windowMs: 10 * 60 * 1000,
  bucket: "upload",
});

// One unbroken chain: `hc<AppType>` infers paths, bodies and responses from this
// expression's type. Splitting it into statements silently destroys that.
export const assetRoutes = new Hono()
  .post(
    "/assets",
    uploadLimit,
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES,
      onError: (c) =>
        c.json(
          new PanelError(413, "payloadTooLarge", "Payload too large", {
            max: MAX_UPLOAD_BYTES,
          }).toBody(),
          413,
        ),
    }),
    zValidator("form", uploadSchema, onInvalid),
    async (c) =>
      c.json(await assetController.upload(requireSessionId(c), c.req.valid("form")), 201),
  )
  .delete("/assets/:id", (c) => {
    assetController.remove(requireSessionId(c), c.req.param("id"));
    return c.body(null, 204);
  });
