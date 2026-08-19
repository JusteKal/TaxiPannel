import { computed, readonly, ref } from "vue";

const STORAGE_KEY = "taxipannel:access";

interface Grant {
  token: string;
  expiresAt: number;
}

// localStorage, unlike the session id in useSession: the PIN gates a small
// trusted group and re-typing it in every new tab is friction for nothing.
// What actually bounds a leaked token is ACCESS_TOKEN_TTL_MS on the server.
let grant: Grant | null = read();

// Initial values are never rendered — `checked` holds the UI back until GET
// /auth answers, so a locked-out visitor never sees a flash of the builder.
const required = ref(false);
const unlocked = ref(false);
const checked = ref(false);

function read(): Grant | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Grant>;
    if (typeof parsed?.token !== "string" || !parsed.expiresAt) return null;
    return parsed.expiresAt <= Date.now()
      ? null
      : { token: parsed.token, expiresAt: parsed.expiresAt };
  } catch {
    // Private mode, quota, or a hand-edited value: treat it as locked.
    return null;
  }
}

function write(next: Grant | null): void {
  grant = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See read(). The in-memory grant still carries this page load.
  }
}

/** Read by the API client on every request. Not reactive: it is never rendered. */
export function accessToken(): string | null {
  if (grant && grant.expiresAt <= Date.now()) write(null);
  return grant?.token ?? null;
}

const locked = computed(() => checked.value && required.value && !unlocked.value);
const ready = computed(() => checked.value && !locked.value);

export function useAccess() {
  /**
   * `null` means the check itself failed. The app renders and the real calls
   * report the outage; a visitor who should be locked out still gets nowhere,
   * because every route answers `pinRequired` and that calls lock().
   */
  function settle(state: { required: boolean; authenticated: boolean } | null): void {
    checked.value = true;
    if (!state) return;
    required.value = state.required;
    unlocked.value = state.authenticated;
    if (!state.authenticated) write(null);
  }

  function open(next: Grant): void {
    write(next);
    required.value = true;
    unlocked.value = true;
    checked.value = true;
  }

  /** Called from the API client the moment any route answers `pinRequired`. */
  function lock(): void {
    write(null);
    required.value = true;
    unlocked.value = false;
    checked.value = true;
  }

  return {
    required: readonly(required),
    unlocked: readonly(unlocked),
    checked: readonly(checked),
    locked,
    ready,
    settle,
    open,
    lock,
  };
}
