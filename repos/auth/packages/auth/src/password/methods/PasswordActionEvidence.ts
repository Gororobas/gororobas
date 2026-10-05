import { Context, type Effect, type Redacted } from "effect";

import type { AuthInvocation } from "../../operations/context";
import type { ProofCompletionInput } from "../../proofs/ProofPersistence";
import type { AuthenticationEvidence, AuthenticationRequirement } from "../../sessions/models";
import type { PasswordActionRequired, PasswordUnavailable } from "./errors";
import type { PasswordActionChallenge } from "./models";

/** Independently verify action-specific evidence against this exact challenge.
 * proof means fresh independently verifiable input for THIS call. Hashing uses
 * a new salt each retry: a grant bound to an earlier challenge cannot be resumed
 * here. Such a workflow requires a separately persisted replacement intent.
 * Consume replay-sensitive factor input in its OWN authority before returning.
 * A later rejected password mutation does not refund that factor; retries need
 * fresh evidence. Mere replay-counter/code consumption preserves semantic factor
 * revision; factor replacement/revocation changes it and wins the final password CAS.
 * This port has no atomic factor-consumption/password-write plan.
 * No default permits mutation. Login-pending credentials are not action grants.
 * A session is usable only with current revision/factor authority; an unexpired
 * pure-stateless caller alone does not prove current credential-change authority.
 * Current recovery policy may accept a reset continuation for a single-factor
 * subject, but it must never erase/bypass enabled MFA. No client factor assertions.
 */
export class PasswordActionEvidence extends Context.Service<
  PasswordActionEvidence,
  {
    readonly verify: (input: {
      readonly challenge: PasswordActionChallenge;
      readonly invocation: AuthInvocation;
      readonly proof?: Redacted.Redacted<string>;
      readonly currentPasswordEvidence?: AuthenticationEvidence;
      readonly recovery?: ProofCompletionInput;
    }) => Effect.Effect<
      {
        readonly evidence: AuthenticationEvidence;
        readonly requirement: AuthenticationRequirement;
      },
      PasswordActionRequired | PasswordUnavailable
    >;
  }
>()("effect-auth/PasswordActionEvidence") {}
