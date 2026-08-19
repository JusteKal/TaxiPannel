import type { ContentfulStatusCode } from "hono/utils/http-status";

export type PanelErrorCode =
  // transport / session
  | "missingSessionId"
  | "invalidRequest"
  | "pinRequired"
  | "invalidPin"
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
 * The API never sends prose meant for the screen. `error` is for whoever is
 * reading the wire; the client owns the wording, keyed by `code` with `params`
 * as interpolations.
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
