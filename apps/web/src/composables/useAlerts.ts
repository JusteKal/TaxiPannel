import { readonly, ref } from "vue";

export type AlertLevel = "danger" | "warning" | "success" | "info";

export interface Alert {
  id: number;
  level: AlertLevel;
  message: string;
}

const AUTO_DISMISS_MS = 8000;

// Module scope: one stack for the whole app.
const alerts = ref<Alert[]>([]);
let nextId = 1;

export function useAlerts() {
  function push(message: string, level: AlertLevel = "danger"): void {
    const id = nextId++;
    // Same message twice in a row is noise, not information.
    if (alerts.value.some((a) => a.message === message && a.level === level)) return;
    alerts.value = [...alerts.value, { id, level, message }];
    const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    timer.unref?.();
  }

  function dismiss(id: number): void {
    alerts.value = alerts.value.filter((a) => a.id !== id);
  }

  function clear(): void {
    alerts.value = [];
  }

  return { alerts: readonly(alerts), push, dismiss, clear };
}
