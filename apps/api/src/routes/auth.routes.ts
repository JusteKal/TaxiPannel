import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { authController } from "../controllers/auth.controller";
import { ACCESS_TOKEN_HEADER } from "../middleware/access";
import { rateLimit } from "../middleware/rate-limit";
import { PanelError } from "../models/errors";

const PIN_ATTEMPTS_PER_10MIN = Number(process.env.PIN_ATTEMPTS_PER_10MIN ?? 10);

// A PIN is short by nature and this route is the one thing the gate leaves
// public, so this counter is the only brake on guessing. It is per client key,
// which a distributed guesser sidesteps — hence the README asking for a long
// PIN rather than four digits.
const attemptLimit = rateLimit({
  limit: PIN_ATTEMPTS_PER_10MIN,
  windowMs: 10 * 60 * 1000,
  bucket: "auth",
});

const MAX_JSON_BYTES = 1024;

const unlockSchema = z.object({ pin: z.string().min(1).max(128) });

function onInvalid(result: { success: boolean }): void {
  if (!result.success) {
    throw new PanelError(400, "invalidRequest", "Invalid request payload");
  }
}

export const authRoutes = new Hono()
  .get("/auth", (c) => c.json(authController.state(c.req.header(ACCESS_TOKEN_HEADER)?.trim())))
  .post(
    "/auth",
    attemptLimit,
    bodyLimit({
      maxSize: MAX_JSON_BYTES,
      onError: (c) =>
        c.json(
          new PanelError(413, "payloadTooLarge", "Payload too large", {
            max: MAX_JSON_BYTES,
          }).toBody(),
          413,
        ),
    }),
    zValidator("json", unlockSchema, onInvalid),
    (c) => c.json(authController.unlock(c.req.valid("json").pin)),
  );
