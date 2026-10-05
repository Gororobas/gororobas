import { Context, type DateTime, type Effect } from "effect";

import type { PreparedCommit } from "../hooks/commit";
import type { SubjectId } from "../Schema";
import type { PrepareSessionCommit } from "./commit";
import type {
  PendingAuthenticationInvalid,
  SessionUnavailable,
  StaleAuthentication,
} from "./errors";
import type {
  AuthenticationEvidence,
  AuthenticationRequirement,
  AuthenticationRevision,
  PendingConsumption,
} from "./models";

/** Subject status, factor policy, and revision are owned by the consumer's identity authority. */
export class AuthenticationAuthority extends Context.Service<
  AuthenticationAuthority,
  {
    /** Before verification, read active subject + these independently resolved credential IDs. */
    readonly capture: (
      subjectId: SubjectId,
      credentialIds: ReadonlyArray<string>,
    ) => Effect.Effect<AuthenticationRevision, StaleAuthentication | SessionUnavailable>;
    /** Reject unless the captured revision is still current; never refresh old evidence's revision. */
    readonly requirements: (
      evidence: AuthenticationEvidence,
    ) => Effect.Effect<AuthenticationRequirement, StaleAuthentication | SessionUnavailable>;
    /**
     * Linearization point for fresh signed-session authentication. Check active
     * subject, current factor policy/freshness, unexpired issuance, and exactly these revisions, consuming pending state in the same
     * commit when provided. Re-read the clock at the conditional commit, never rely
     * solely on the caller's pre-hook timestamp. Stateless verification and renewal never call this.
     */
    readonly approve: <A>(
      input: {
        readonly evidence: AuthenticationEvidence;
        readonly now: DateTime.Utc;
        readonly expiresAt: DateTime.Utc;
        readonly absoluteExpiresAt: DateTime.Utc;
        readonly pending?: PendingConsumption;
      },
      prepare: PrepareSessionCommit<void, A>,
    ) => Effect.Effect<
      PreparedCommit<A>,
      StaleAuthentication | PendingAuthenticationInvalid | SessionUnavailable
    >;
  }
>()("effect-auth/AuthenticationAuthority") {}
