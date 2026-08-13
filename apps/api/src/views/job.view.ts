import type { PanelErrorCode, PanelErrorParams } from "../models/errors";
import type { Job, JobPhase, JobStatus } from "../models/types";

export interface JobView {
  id: string;
  status: JobStatus;
  phase: JobPhase;
  progress: number;
  totalFrames: number;
  keptFrames: number | null;
  width: number;
  height: number;
  loopSeconds: number;
  bytes: number | null;
  error: { code: PanelErrorCode; params?: PanelErrorParams } | null;
}

/**
 * The projection choke point. Three things must never cross it:
 * `sessionId`, the result bytes, and `error.message` — which carries the tail of
 * ffmpeg's stderr and would leak filesystem paths. The client renders
 * `errors.<code>` from its own messages, so it never needed the text.
 */
export function presentJob(job: Job): JobView {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    totalFrames: job.totalFrames,
    keptFrames: job.keptFrames,
    width: job.width,
    height: job.height,
    loopSeconds: job.loopSeconds,
    bytes: job.bytes,
    error: job.error ? { code: job.error.code, params: job.error.params } : null,
  };
}

export function isSettled(view: JobView): boolean {
  return view.status !== "queued" && view.status !== "running";
}
