import { Auth, Passkey, Totp } from "@yielded/auth";

import {
  StudioClaims,
  policy,
  registrationSchema,
  management,
  authenticatorPolicy,
} from "./studio-models";
export { StudioClaims, authenticatorPolicy } from "./studio-models";

export class StudioAuth extends Auth.Service<StudioAuth>()("studio/Auth", {
  claims: StudioClaims,
  strategies: {
    passkey: Passkey.make({ namespace: "studio/passkey", policy: policy }),
    registration: Passkey.makeRegistration({
      namespace: "studio/passkey",
      policy: policy,
      registration: registrationSchema,
    }),
    keys: Passkey.makeManagement({
      namespace: "studio/passkey",
      policy: policy,
      management: management,
    }),
    authenticator: Totp.make({ ...authenticatorPolicy, namespace: "studio/totp" }),
  },
  defaultStrategy: "passkey",
}) {}

export const sessions = StudioAuth.sessions;
