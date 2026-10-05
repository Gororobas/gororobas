import { Context, type Effect, type Redacted } from "effect";

import type { AuthInvocation } from "../operations/context";
import type { AuthenticationEvidence, AuthenticationRequirement } from "../sessions/models";
import type { PhoneActionChallenge, PhoneActionRequired } from "./lifecycleModels";
import type { PhoneOtpUnavailable } from "./models";

/** Independent fresh authentication for phone custody mutation. A new phone code
 * cannot authorize replacement of an existing account identifier or stronger factor.
 * Consume one-use proofs before returning; later CAS failure does not refund them. */
export class PhoneActionEvidence extends Context.Service<
  PhoneActionEvidence,
  {
    readonly verify: (input: {
      readonly invocation: AuthInvocation;
      readonly challenge: PhoneActionChallenge;
      readonly proof?: Redacted.Redacted<string>;
    }) => Effect.Effect<
      {
        readonly evidence: AuthenticationEvidence;
        readonly requirement: AuthenticationRequirement;
      },
      PhoneActionRequired | PhoneOtpUnavailable
    >;
  }
>()("effect-auth/PhoneActionEvidence") {}
