const STORAGE_KEY = "taxipannel:session";

// Module scope, so every caller shares one id. sessionStorage and not
// localStorage: assets are scoped to a browsing session and expire server-side
// after 30 minutes anyway, so persisting across tabs would only hand out ids
// whose assets are already gone.
let sessionId: string | null = null;

function readOrCreate(): string {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
  } catch {
    // Private mode: fall through to a per-page-load id.
  }
  const created = crypto.randomUUID();
  try {
    sessionStorage.setItem(STORAGE_KEY, created);
  } catch {
    // See above.
  }
  return created;
}

export function useSession(): { sessionId: string } {
  sessionId ??= readOrCreate();
  return { sessionId };
}
