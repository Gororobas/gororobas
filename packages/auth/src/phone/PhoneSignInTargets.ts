import { Context, type Effect, type Option } from "effect";

import type { PhoneCredentialSnapshot, PhoneNumber, PhoneOtpUnavailable } from "./models";

/** Resolve only an existing active account with this exact verified phone credential.
 * Reassignment/revocation must bump its authentication revision atomically. Custody
 * revisions are never reused, including after deletion; outstanding codes cannot
 * transfer to another account. Unknown or ineligible numbers return None.
 * This capability never provisions or links an account based on a phone match.
 */
export class PhoneSignInTargets extends Context.Service<
  PhoneSignInTargets,
  {
    readonly lookup: (input: {
      readonly moduleId: string;
      readonly phoneNumber: PhoneNumber;
    }) => Effect.Effect<Option.Option<PhoneCredentialSnapshot>, PhoneOtpUnavailable>;
  }
>()("effect-auth/PhoneSignInTargets") {}
