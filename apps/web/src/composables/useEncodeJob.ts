import { MAX_RECOMMENDED_FRAMES, normalizeSettings } from "@taxipannel/api/timeline";
import { computed, ref, shallowRef } from "vue";
import {
  ApiError,
  cancelJob,
  createJob,
  fetchResult,
  getJob,
  type JobView,
  streamJob,
} from "../api/client";
import { useAlerts } from "./useAlerts";
import { readyAssetIds, useGalleries } from "./useGalleries";
import { useSettings } from "./useSettings";

// Module scope: one running job at a time for the whole app.
const job = shallowRef<JobView | null>(null);
const busy = ref(false);
const resultUrl = shallowRef<string | null>(null);
const pendingConfirmation = ref(false);

let controller: AbortController | null = null;

/** Exactly one object URL alive per result, revoked before the next is minted. */
function setResult(blob: Blob | null): void {
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value);
  resultUrl.value = blob ? URL.createObjectURL(blob) : null;
}

export function disposeResult(): void {
  setResult(null);
}

export function useEncodeJob() {
  const { right, left } = useGalleries();
  const { settings, timeline } = useSettings();
  const { push } = useAlerts();

  const running = computed(() => job.value?.status === "queued" || job.value?.status === "running");

  function report(err: unknown): void {
    if (err instanceof ApiError) push(`errors.${err.code}`, err.params);
    else push("errors.network");
  }

  async function start(acknowledgeFrames = false): Promise<void> {
    if (busy.value) return;

    const rightIds = readyAssetIds(right.value);
    const leftIds = readyAssetIds(left.value);
    if (rightIds.length === 0 || leftIds.length === 0) {
      push("errors.emptyPanel", undefined, "warning");
      return;
    }

    // Ask before spending minutes on it. The server enforces the same rule, so
    // this dialog is a courtesy rather than the actual gate.
    if (!acknowledgeFrames && timeline.value.totalFrames > MAX_RECOMMENDED_FRAMES) {
      pendingConfirmation.value = true;
      return;
    }
    pendingConfirmation.value = false;

    busy.value = true;
    setResult(null);
    controller = new AbortController();

    try {
      const created = await createJob({
        right: rightIds,
        left: leftIds,
        settings: normalizeSettings(settings),
        acknowledgeFrames: acknowledgeFrames || undefined,
      });
      job.value = created;
      await follow(created.id, controller.signal);
    } catch (err) {
      report(err);
      job.value = null;
    } finally {
      busy.value = false;
      controller = null;
    }
  }

  async function follow(id: string, signal: AbortSignal): Promise<void> {
    let settled = false;
    try {
      for await (const view of streamJob(id, signal)) {
        job.value = view;
        if (view.status !== "queued" && view.status !== "running") settled = true;
      }
    } catch (err) {
      if (signal.aborted) return;
      report(err);
    }

    // A stream that ended without a terminal event means the connection died —
    // `bun run --hot` restarting the API does exactly this. Fall back once
    // before giving up.
    if (!settled && !signal.aborted) {
      try {
        job.value = await getJob(id);
        settled = job.value.status !== "queued" && job.value.status !== "running";
      } catch (err) {
        report(err);
        return;
      }
    }

    const final = job.value;
    if (!final) return;
    if (final.status === "done") {
      try {
        setResult(await fetchResult(final.id));
      } catch (err) {
        report(err);
      }
    } else if (final.status === "failed" && final.error) {
      push(`errors.${final.error.code}`, final.error.params);
    }
  }

  async function cancel(): Promise<void> {
    const current = job.value;
    controller?.abort();
    if (!current) return;
    try {
      await cancelJob(current.id);
    } catch {
      // The job is going away either way; a failed cancel is not worth an alert.
    }
    job.value = { ...current, status: "canceled", phase: "settled" };
  }

  function reset(): void {
    job.value = null;
    setResult(null);
  }

  return {
    job,
    busy,
    running,
    resultUrl,
    pendingConfirmation,
    start,
    cancel,
    reset,
  };
}
