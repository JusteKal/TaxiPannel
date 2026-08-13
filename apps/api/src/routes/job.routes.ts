import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { jobController } from "../controllers/job.controller";
import { rateLimit } from "../middleware/rate-limit";
import { requireSessionId } from "../middleware/session";
import { PanelError } from "../models/errors";
import { MAX_IMAGES_PER_PANEL } from "../models/job.model";
import { FPS_OPTIONS, SCALE_OPTIONS, SETTINGS_SPEC } from "../models/timeline.model";
import { isSettled, presentJob } from "../views/job.view";

const JOB_LIMIT_PER_10MIN = Number(process.env.JOB_LIMIT_PER_10MIN ?? 30);

// A 12 MB body cannot reach JSON.parse: the global bodyLimit is sized for image
// uploads, so /jobs needs its own, much tighter one.
const MAX_JSON_BYTES = 16 * 1024;

function onInvalid(result: { success: boolean }): void {
  if (!result.success) {
    throw new PanelError(400, "invalidRequest", "Invalid request payload");
  }
}

const literals = <T extends number>(values: readonly T[]) =>
  z.union(
    values.map((v) => z.literal(v)) as unknown as [
      z.ZodLiteral<T>,
      z.ZodLiteral<T>,
      ...z.ZodLiteral<T>[],
    ],
  );

// Built from SETTINGS_SPEC so the input attributes, the client-side clamp and
// the server-side bounds cannot drift apart.
const settingsSchema = z.object({
  displayDuration: z.number().finite().min(SETTINGS_SPEC.displayDuration.clampMin).max(600),
  transitionDuration: z.number().finite().min(SETTINGS_SPEC.transitionDuration.clampMin).max(600),
  fps: literals(FPS_OPTIONS),
  scale: literals(SCALE_OPTIONS),
  gifQuality: z.number().int().min(SETTINGS_SPEC.gifQuality.min).max(SETTINGS_SPEC.gifQuality.max),
  skipSimilarity: z
    .number()
    .finite()
    .min(SETTINGS_SPEC.skipSimilarity.min)
    .max(SETTINGS_SPEC.skipSimilarity.max),
});

const panelSchema = z.array(z.string().uuid()).min(1).max(MAX_IMAGES_PER_PANEL);

const createJobSchema = z.object({
  // "right" is the old gallery key `x` (Panneau droite), "left" is `y`.
  right: panelSchema,
  left: panelSchema,
  settings: settingsSchema,
  // The >600-frame dialog's handshake. Absent means "the client has not warned
  // the user yet", so the server answers 409 framesExceeded instead of running.
  acknowledgeFrames: z.boolean().optional(),
});

const jobLimit = rateLimit({
  limit: JOB_LIMIT_PER_10MIN,
  windowMs: 10 * 60 * 1000,
  bucket: "job",
});

const jsonLimit = bodyLimit({
  maxSize: MAX_JSON_BYTES,
  onError: (c) =>
    c.json(
      new PanelError(413, "payloadTooLarge", "Payload too large", {
        max: MAX_JSON_BYTES,
      }).toBody(),
      413,
    ),
});

export const jobRoutes = new Hono()
  .post("/jobs", jobLimit, jsonLimit, zValidator("json", createJobSchema, onInvalid), (c) =>
    c.json(jobController.create(requireSessionId(c), c.req.valid("json")), 202),
  )
  .get("/jobs/:id", (c) => c.json(jobController.status(requireSessionId(c), c.req.param("id"))))
  .get("/jobs/:id/events", (c) => {
    const job = jobController.entity(requireSessionId(c), c.req.param("id"));
    return streamSSE(c, async (stream) => {
      let pending = true;
      let wake: (() => void) | null = null;
      const listener = () => {
        pending = true;
        wake?.();
      };
      job.listeners.add(listener);
      stream.onAbort(() => {
        job.listeners.delete(listener);
        wake?.();
      });

      try {
        while (!stream.closed) {
          if (pending) {
            pending = false;
            const view = presentJob(job);
            await stream.writeSSE({ event: view.status, data: JSON.stringify(view) });
            // The stream closes itself the moment the job settles; there is
            // nothing left to report and EventSource would otherwise reconnect.
            if (isSettled(view)) return;
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      } finally {
        job.listeners.delete(listener);
      }
    });
  })
  .get("/jobs/:id/result", (c) => {
    const gif = jobController.result(requireSessionId(c), c.req.param("id"));
    c.header("Content-Type", "image/gif");
    c.header("Content-Disposition", 'attachment; filename="pannelisation.gif"');
    c.header("Cache-Control", "no-store");
    return c.body(gif as unknown as ArrayBuffer);
  })
  .delete("/jobs/:id", (c) => {
    jobController.cancel(requireSessionId(c), c.req.param("id"));
    return c.body(null, 204);
  });
