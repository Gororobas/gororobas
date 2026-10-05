import { Context, type Effect, type Redacted } from "effect";

import type { AuthInvocation } from "../operations/context";
import type { AuthenticationEvidence, AuthenticationRequirement } from "../sessions/models";
import type { PasskeyActionRequired, PasskeyUnavailable } from "./errors";
import type { PasskeyActionChallenge } from "./models";

/** Independent current action authority. Consume replay-sensitive input in its
 * own authority; later enrollment/removal failure never refunds it. Applications
 * may authorize enrollment from a valid session under their freshness policy,
 * preserving its original proof times and factors. No default. */
export class PasskeyActionEvidence extends Context.Service<
  PasskeyActionEvidence,
  {
    readonly verify: (input: {
      readonly invocation: AuthInvocation;
      readonly challenge: PasskeyActionChallenge;
      readonly proof?: Redacted.Redacted<string>;
    }) => Effect.Effect<
      {
        readonly evidence: AuthenticationEvidence;
        readonly requirement: AuthenticationRequirement;
      },
      PasskeyActionRequired | PasskeyUnavailable
    >;
  }
>()("effect-auth/PasskeyActionEvidence") {}
