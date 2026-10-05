import { Context, type Effect, type Redacted } from "effect";

import type { AuthInvocation } from "../operations/context";
import type { AuthenticationEvidence, AuthenticationRequirement } from "../sessions/models";
import type { EmailActionRequired, EmailUnavailable } from "./errors";
import type { EmailActionChallenge } from "./models";

export interface EmailActionAuthorization {
  readonly challenge: EmailActionChallenge;
  readonly evidence: AuthenticationEvidence;
  readonly requirement: AuthenticationRequirement;
}

/** Current subject/action authority; no default grants mutations. Target email
 * proof and login-pending credentials never satisfy this independent authorization.
 * Consume replay-sensitive factors in their own authority before returning; later
 * identity CAS failure does not refund them. Counter advancement preserves semantic
 * factor revision, while revocation/replacement changes it and wins final CAS.
 * Request and completion each require authorization. Existing-identifier confirmation
 * may use a valid session under application policy; adding or replacing an identifier
 * requires fresh authorization bounded by EmailAddressPolicy.
 * no promise that a consumed one-time factor can be resubmitted at completion.
 */
export class EmailActionEvidence extends Context.Service<
  EmailActionEvidence,
  {
    readonly verify: (input: {
      readonly invocation: AuthInvocation;
      readonly challenge: EmailActionChallenge;
      readonly proof?: Redacted.Redacted<string>;
    }) => Effect.Effect<
      {
        readonly evidence: AuthenticationEvidence;
        readonly requirement: AuthenticationRequirement;
      },
      EmailActionRequired | EmailUnavailable
    >;
  }
>()("effect-auth/EmailActionEvidence") {}
