import type { PanelErrorCode, PanelErrorParams } from "./errors";
import type { PanelImage } from "./image.model";
import type { Settings } from "./timeline.model";

export interface Asset {
  id: string;
  sessionId: string;
  name: string;
  width: number;
  height: number;
  /** Frame count as declared by the source; 1 for a still image. */
  frames: number;
  bytes: Uint8Array;
  size: number;
  createdAt: number;
  /**
   * Resized panels are cached per geometry: the user nudges a slider and
   * regenerates, and only the `scale` setting changes the key.
   */
  resized: Map<string, PanelImage>;
}

export type JobStatus = "queued" | "running" | "done" | "failed" | "canceled";
export type JobPhase =
  | "queued"
  | "decoding"
  | "palette"
  | "encoding"
  | "optimizing"
  | "shrinking"
  | "settled";

/** What the size budget forced us to change, relative to what was requested. */
export interface JobDegradation {
  gifQuality: number;
  fps: number;
  skipSimilarity: number;
  steps: number;
}

export interface JobError {
  code: PanelErrorCode;
  message: string;
  params?: PanelErrorParams;
}

export interface Job {
  id: string;
  sessionId: string;
  status: JobStatus;
  phase: JobPhase;
  /** 0..1 across the whole run, not per phase. */
  progress: number;
  settings: Settings;
  rightIds: string[];
  leftIds: string[];
  totalFrames: number;
  keptFrames: number | null;
  width: number;
  height: number;
  loopSeconds: number;
  result: Uint8Array | null;
  bytes: number | null;
  budgetBytes: number;
  degradation: JobDegradation | null;
  error: JobError | null;
  createdAt: number;
  lastSeenAt: number;
  abort: AbortController;
  /** In-process fan-out for the SSE stream. */
  listeners: Set<() => void>;
}
