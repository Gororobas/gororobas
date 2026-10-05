import { Context, type Effect, type Redacted } from "effect";

import type { AuthInvocation } from "../operations/context";
import type { AuthenticationEvidence, AuthenticationRequirement } from "../sessions/models";
import type { OAuthActionChallenge, OAuthActionRequired } from "./accountsModels";
import type { OAuthUnavailable } from "./signInErrors";

/** Independent current action authority; no default grants access. Verify exact
 * challenge/subject/revisions and consume one-time factors in their own authority
 * before returning. Public session assurance, pending-login and registration
 * credentials are not action proof. Begin and Complete require separate evidence.
 * Counter consumption need not replace semantic credential revision; replacement,
 * revocation and policy/binding changes must advance the corresponding revisions.
 * A later OAuth CAS rejection does not refund a factor or imply an atomic join.
 */
export class OAuthActionEvidence extends Context.Service<
  OAuthActionEvidence,
  {
    readonly verify: (input: {
      readonly invocation: AuthInvocation;
      readonly challenge: OAuthActionChallenge;
      readonly proof?: Redacted.Redacted<string>;
    }) => Effect.Effect<
      {
        readonly evidence: AuthenticationEvidence;
        readonly requirement: AuthenticationRequirement;
      },
      OAuthActionRequired | OAuthUnavailable
    >;
  }
>()("effect-auth/OAuthActionEvidence") {}
