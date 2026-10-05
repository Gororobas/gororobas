import { Context, type Effect, type Redacted } from "effect";

import type { AuthInvocation } from "../operations/context";
import type { AuthenticationEvidence, AuthenticationRequirement } from "../sessions/models";
import type {
  OAuthConnectedActionChallenge,
  OAuthConnectedActionRequired,
} from "./connectedModels";
import type { OAuthUnavailable } from "./signInErrors";

/** Independent exact-action authority. Consume one-time evidence before returning;
 * later connected CAS loss does not refund it. No session-summary default. */
export class OAuthConnectedActionEvidence extends Context.Service<
  OAuthConnectedActionEvidence,
  {
    readonly verify: (input: {
      readonly invocation: AuthInvocation;
      readonly challenge: OAuthConnectedActionChallenge;
      readonly proof?: Redacted.Redacted<string>;
    }) => Effect.Effect<
      {
        readonly evidence: AuthenticationEvidence;
        readonly requirement: AuthenticationRequirement;
      },
      OAuthConnectedActionRequired | OAuthUnavailable
    >;
  }
>()("effect-auth/OAuthConnectedActionEvidence") {}
