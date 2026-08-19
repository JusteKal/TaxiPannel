import { gateEnabled, grantValid, redeemPin } from "../models/access.model";
import type { AccessView, GrantView } from "../views/auth.view";

export const authController = {
  state(token: string | undefined): AccessView {
    const required = gateEnabled();
    return { required, authenticated: !required || grantValid(token) };
  },

  unlock(pin: string): GrantView {
    return redeemPin(pin);
  },
};
