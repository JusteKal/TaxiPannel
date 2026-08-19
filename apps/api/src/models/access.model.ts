import { createHash, timingSafeEqual } from "node:crypto";
import { PanelError } from "./errors";

// Empty means the gate is off entirely, so `bun install && bun run dev` still
// boots into a usable app with no .env at all. Setting it is what closes the
// platform; leaving it unset in production leaves it open to anyone.
const ACCESS_PIN = (process.env.ACCESS_PIN ?? "").trim();
const ACCESS_TOKEN_TTL_MS = Number(process.env.ACCESS_TOKEN_TTL_MS ?? 12 * 60 * 60 * 1000);

// Same in-process story as assets and jobs: one replica, so a token minted here
// is only ever presented here. A restart drops every grant, which costs one PIN
// prompt — cheaper than a signing secret nobody would ever rotate.
const grants = new Map<string, number>();

export function gateEnabled(): boolean {
  return ACCESS_PIN.length > 0;
}

// Digests and not the raw strings: timingSafeEqual throws outright on a length
// mismatch, which would turn the comparison into a length oracle for the PIN.
function pinMatches(candidate: string): boolean {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(ACCESS_PIN).digest();
  return timingSafeEqual(a, b);
}

export function redeemPin(pin: string): { token: string; expiresAt: number } {
  if (!gateEnabled() || !pinMatches(pin)) {
    throw new PanelError(401, "invalidPin", "Invalid PIN");
  }
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + ACCESS_TOKEN_TTL_MS;
  grants.set(token, expiresAt);
  return { token, expiresAt };
}

export function grantValid(token: string | undefined): boolean {
  if (!token) return false;
  const expiresAt = grants.get(token);
  if (expiresAt === undefined) return false;
  if (expiresAt <= Date.now()) {
    grants.delete(token);
    return false;
  }
  return true;
}

export function startAccessJanitor(): void {
  const timer = setInterval(
    () => {
      const now = Date.now();
      for (const [token, expiresAt] of grants) {
        if (expiresAt <= now) grants.delete(token);
      }
    },
    5 * 60 * 1000,
  );
  timer.unref?.();
}
