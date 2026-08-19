export interface AccessView {
  /** False when ACCESS_PIN is unset: the client skips the gate entirely. */
  required: boolean;
  /** True as soon as the client may proceed, gate off included. */
  authenticated: boolean;
}

export interface GrantView {
  token: string;
  /** Epoch ms. The client drops the token itself rather than waiting for a 401. */
  expiresAt: number;
}
