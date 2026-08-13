import type { AppType, PanelErrorCode, PanelErrorParams } from "@taxipannel/api";
import { hc } from "hono/client";
import { useSession } from "../composables/useSession";

// Components import these from here, never from "@taxipannel/api" — one seam to
// change if the package is ever renamed or split.
export type {
  AssetView,
  JobPhase,
  JobStatus,
  JobView,
  PanelErrorCode,
  PanelErrorParams,
  Settings,
} from "@taxipannel/api";

// Relative by design: Vite's dev proxy and Caddy's `handle_path /api/*` both
// strip this prefix, so no hostname is ever baked into the bundle.
const baseUrl = import.meta.env.VITE_API_URL ?? "/api";

export const SESSION_HEADER = "x-session-id";

function authHeaders(): Record<string, string> {
  return { [SESSION_HEADER]: useSession().sessionId };
}

export const client = hc<AppType>(baseUrl, { headers: () => authHeaders() });

export class ApiError extends Error {
  constructor(
    public code: PanelErrorCode | "network" | "unknown",
    public status: number,
    public params?: PanelErrorParams,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      code?: PanelErrorCode;
      params?: PanelErrorParams;
    };
    return new ApiError(body.code ?? "unknown", res.status, body.params);
  } catch {
    return new ApiError("unknown", res.status);
  }
}

export async function uploadAsset(file: File, signal?: AbortSignal) {
  const res = await client.assets.$post({ form: { file } }, { init: { signal } });
  if (!res.ok) throw await readError(res);
  return res.json();
}

export async function deleteAsset(id: string): Promise<void> {
  const res = await client.assets[":id"].$delete({ param: { id } });
  // 404 means it already expired out of the server's map — nothing to clean up.
  // The status is widened because hc types a DELETE as its success code only;
  // it models no error responses, but the server certainly sends them.
  if (!res.ok && (res.status as number) !== 404) throw await readError(res);
}

export interface CreateJobInput {
  right: string[];
  left: string[];
  settings: import("@taxipannel/api").Settings;
  acknowledgeFrames?: boolean;
}

export async function createJob(input: CreateJobInput) {
  const res = await client.jobs.$post({ json: input });
  if (!res.ok) throw await readError(res);
  return res.json();
}

export async function getJob(id: string) {
  const res = await client.jobs[":id"].$get({ param: { id } });
  if (!res.ok) throw await readError(res);
  return res.json();
}

export async function cancelJob(id: string): Promise<void> {
  const res = await client.jobs[":id"].$delete({ param: { id } });
  if (!res.ok && (res.status as number) !== 404) throw await readError(res);
}

export function resultUrl(id: string): string {
  return `${baseUrl}/jobs/${id}/result`;
}

export async function fetchResult(id: string): Promise<Blob> {
  const res = await fetch(resultUrl(id), { headers: authHeaders() });
  if (!res.ok) throw await readError(res);
  return res.blob();
}

/**
 * Hand-rolled SSE over fetch rather than EventSource, for three reasons:
 * EventSource cannot set a header, so the session id would have to go in the
 * query string and thence into every proxy log; it reconnects forever after the
 * server closes a finished job; and AbortController gives cancellation for free.
 */
export async function* streamJob(
  jobId: string,
  signal: AbortSignal,
): AsyncGenerator<import("@taxipannel/api").JobView> {
  const res = await fetch(`${baseUrl}/jobs/${jobId}/events`, {
    headers: { ...authHeaders(), accept: "text/event-stream" },
    signal,
  });
  if (!res.ok || !res.body) throw await readError(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += value;
      // Frames are separated by a blank line, and a chunk can split one in half.
      let sep = buffer.indexOf("\n\n");
      while (sep !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
        if (data) yield JSON.parse(data) as import("@taxipannel/api").JobView;
        sep = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
