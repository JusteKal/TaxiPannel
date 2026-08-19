import { Hono } from "hono";
import { cors } from "hono/cors";
import { ACCESS_TOKEN_HEADER, accessGuard } from "./middleware/access";
import { rateLimit } from "./middleware/rate-limit";
import { SESSION_ID_HEADER } from "./middleware/session";
import { assetCount } from "./models/asset.model";
import { checkEncoders } from "./models/encoder.model";
import { PanelError } from "./models/errors";
import { jobStats } from "./models/job.model";
import { assetRoutes } from "./routes/asset.routes";
import { authRoutes } from "./routes/auth.routes";
import { jobRoutes } from "./routes/job.routes";

// Empty by default: in every supported deployment the SPA and the API are
// same-origin (Caddy `handle_path /api/*` in prod, the Vite proxy in dev), so
// no CORS headers are emitted at all.
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "";
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN ?? 600);

// The whole app is ONE chained expression. `hc<AppType>` infers every path,
// body and response from `typeof app`; breaking the chain into statements
// silently collapses that inference to `any` with no error anywhere.
const app = new Hono()
  .use(
    "*",
    cors({
      origin: CORS_ORIGIN,
      allowHeaders: ["Content-Type", SESSION_ID_HEADER, ACCESS_TOKEN_HEADER],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      exposeHeaders: ["Retry-After", "Content-Disposition"],
    }),
  )
  .use("*", rateLimit({ limit: RATE_LIMIT, windowMs: 60_000 }))
  .use("*", accessGuard())
  .get("/health", async (c) => {
    const encoders = await checkEncoders();
    const stats = jobStats();
    const ok = encoders.ffmpeg && encoders.gifsicle;
    return c.json({ ok, ...encoders, assets: assetCount(), ...stats }, ok ? 200 : 503);
  })
  .route("/", authRoutes)
  .route("/", assetRoutes)
  .route("/", jobRoutes)
  .onError((err, c) => {
    if (err instanceof PanelError) {
      return c.json(err.toBody(), err.status);
    }
    console.error("Unexpected error:", err);
    return c.json({ error: "Internal server error", code: "internal" as const }, 500);
  });

export { app };
export type AppType = typeof app;
