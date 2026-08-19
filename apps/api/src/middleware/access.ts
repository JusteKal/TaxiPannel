import type { MiddlewareHandler } from "hono";
import { gateEnabled, grantValid } from "../models/access.model";
import { PanelError } from "../models/errors";

export const ACCESS_TOKEN_HEADER = "x-access-token";

// `/auth` hands the token out and `/health` is what the container HEALTHCHECK
// polls — gating either would lock the door on the key.
const PUBLIC_PATHS = new Set(["/health", "/auth"]);

/**
 * Registered as `.use("*")` rather than called per handler like
 * `requireSessionId`: a route added later without the call would be silently
 * open, and nothing downstream needs the value. It sets nothing on the context,
 * so `hc<AppType>` inference is untouched.
 */
export function accessGuard(): MiddlewareHandler {
  return async (c, next) => {
    if (!gateEnabled() || PUBLIC_PATHS.has(c.req.path)) return next();
    if (!grantValid(c.req.header(ACCESS_TOKEN_HEADER)?.trim())) {
      throw new PanelError(401, "pinRequired", "Access PIN required");
    }
    return next();
  };
}
