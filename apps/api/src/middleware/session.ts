import type { Context } from "hono";
import { PanelError } from "../models/errors";

export const SESSION_ID_HEADER = "x-session-id";

/**
 * Called INSIDE handlers rather than registered as Hono middleware: middleware
 * that mutates the context type breaks `hc<AppType>` inference, and calling it
 * per route keeps the requirement visible at the call site.
 */
export function requireSessionId(c: Context): string {
  const id = c.req.header(SESSION_ID_HEADER)?.trim();
  if (!id) {
    throw new PanelError(401, "missingSessionId", `Missing ${SESSION_ID_HEADER} header`);
  }
  return id;
}
