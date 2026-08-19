import type { ContentfulStatusCode } from "hono/utils/http-status";

export type PanelErrorCode =
  // transport / session
  | "missingSessionId"
  | "invalidRequest"
  | "payloadTooLarge"
  | "rateLimited"
  | "serverBusy"
  // assets
  | "unsupportedImage"
  | "staticImageOnly"
  | "imageTooLarge"
  | "tooManyAssets"
  | "assetNotFound"
  // job creation
  | "emptyPanel"
  | "framesExceeded"
  | "framesTooMany"
  | "budgetExceeded"
  // job lifecycle
  | "jobNotFound"
  | "jobNotReady"
  | "jobFailed"
  | "jobCanceled"
  // encoding
  | "encodeFailed"
  | "encodeTimeout"
  | "encoderMissing"
  | "internal";

export type PanelErrorParams = Record<string, string | number>;

export interface PanelErrorBody {
  error: string;
  code: PanelErrorCode;
  params?: PanelErrorParams;
}

/**
 * The API never translates. `error` is an English fallback for anyone reading
 * the wire directly; the client resolves `errors.<code>` against its own
 * messages with `params` as interpolations, so a mid-session language switch
 * re-renders every visible error.
 */
export class PanelError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: PanelErrorCode,
    message: string,
    public params?: PanelErrorParams,
  ) {
    super(message);
    this.name = "PanelError";
  }

  toBody(): PanelErrorBody {
    return this.params
      ? { error: this.message, code: this.code, params: this.params }
      : { error: this.message, code: this.code };
  }
}
