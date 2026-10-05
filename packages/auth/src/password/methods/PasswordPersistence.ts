import { Context, type Effect, type Option, type Redacted } from "effect";

import type { CommitJournal, PreparedCommit } from "../../hooks/commit";
import type { LoginIdentifier } from "../../identity/models";
import type { ProofCompletionPlan } from "../../proofs/completion";
import type { ProofCompletionInput } from "../../proofs/ProofPersistence";
import type { SubjectId } from "../../Schema";
import type { SessionInvalidationWindow } from "../../sessions/invalidation";
import type { AuthenticationRevision, SecurityRevision } from "../../sessions/models";
import type { EncodedPasswordHash } from "../models";
import type { PasswordUnavailable } from "./errors";
import type {
  PasswordActionAuthorization,
  PasswordAttemptAdmission,
  PasswordAttemptDecision,
  PasswordAttemptId,
  PasswordCommandId,
  PasswordCredentialSnapshot,
  PasswordMutationDecision,
  PasswordReplacement,
} from "./models";
import type { PasswordAttemptPolicy } from "./policy";

export type PreparePasswordCommit<Value, A> = (
  value: Value,
  journal: CommitJournal,
) => PreparedCommit<A>;

export interface PasswordMutationInput {
  readonly moduleId: string;
  readonly commandId: PasswordCommandId;
  readonly expectedRevision: AuthenticationRevision;
  readonly credential?: PasswordCredentialSnapshot;
  readonly replacement: PasswordReplacement;
  readonly authorization: PasswordActionAuthorization;
  readonly invalidation: SessionInvalidationWindow;
}

/** Semantic authority. All mutations prepare before root physical commit and
 * join only an explicitly matching outer authority. Prepared method plans expose
 * a commit Effect that resolves its authority from Effect context at execution.
 * Provide the transaction-bound implementation there. A root service must reject ambient
 * use it cannot join before writes. No generic get/put/upsert.
 */
export class PasswordPersistence extends Context.Service<
  PasswordPersistence,
  {
    /** Charge existence-independent identifier/action + known-subject rolling windows
     * and bounded in-flight admissions before KDF. Capture active subject, identifier,
     * actual credential and semantic revisions atomically (shared authority.capture
     * predicate). Unknown/disabled/missing/corrupt/subject-limited return no verifier.
     * Denial shape never reveals which bucket. No refund on interruption/abandonment;
     * expired pending attempts remain conservatively charged through window horizons.
     * Verification infrastructure failures use this same abandonment policy; they
     * must not settle as credential rejection or refund admission capacity.
     */
    readonly admitAttempt: <A>(
      input: {
        readonly moduleId: string;
        readonly action: "sign-in" | "change";
        readonly identifier: LoginIdentifier;
        readonly subjectId?: SubjectId;
        readonly policy: PasswordAttemptPolicy;
      },
      prepare: PreparePasswordCommit<PasswordAttemptAdmission, A>,
    ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
    /** Single-use settlement. verified requires SAME captured semantic revisions and
     * attempt ownership. Rehash CAS includes old verifier/version, changes verifierVersion
     * only and never semantic/security revisions or a newer credential's counters.
     * A CAS miss cannot become unconditional replacement. This does NOT issue auth.
     * Later session approval compares this same subject securityRevision. Identifier
     * remove/rebind/verification changes that invalidate login MUST bump it atomically;
     * identifierBindingRevision alone is not represented in AuthenticationRevision.
     */
    readonly settleAttempt: <A>(
      input: {
        readonly moduleId: string;
        readonly attemptId: PasswordAttemptId;
        readonly captured?: PasswordCredentialSnapshot;
        readonly outcome: PasswordAttemptDecision;
        readonly rehash?: {
          readonly expectedVersion: SecurityRevision;
          readonly expectedVerifier: Redacted.Redacted<EncodedPasswordHash>;
          readonly nextVerifier: Redacted.Redacted<EncodedPasswordHash>;
        };
      },
      prepare: PreparePasswordCommit<PasswordAttemptDecision, A>,
    ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
    readonly readForSubject: (input: {
      readonly moduleId: string;
      readonly subjectId: SubjectId;
    }) => Effect.Effect<Option.Option<PasswordCredentialSnapshot>, PasswordUnavailable>;
    /** Only eligible verified identifiers; return None for absent/inactive/ineligible. */
    readonly recoveryTarget: (input: {
      readonly moduleId: string;
      readonly identifier: LoginIdentifier;
    }) => Effect.Effect<Option.Option<PasswordCredentialSnapshot>, PasswordUnavailable>;
    /** Require absence, current revisions/action+factor policy/fresh clock. */
    readonly addIfAbsent: <A>(
      input: PasswordMutationInput,
      prepare: PreparePasswordCommit<PasswordMutationDecision, A>,
    ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
    /** Exact credential CAS, current action policy/freshness; bump semantic credential
     * and subject security revisions + pending/session invalidation in SAME authority.
     */
    readonly replaceIfCurrent: <A>(
      input: PasswordMutationInput,
      prepare: PreparePasswordCommit<PasswordMutationDecision, A>,
    ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
    /** Authoritative nonconsuming preflight before exposing new-password policy
     * results or doing KDF work. Final resetWithProof repeats every predicate/CAS.
     */
    readonly checkReset: (
      input: ProofCompletionInput,
    ) => Effect.Effect<boolean, PasswordUnavailable>;
    /** Compose proof predicates + replacement/invalidation atomically. Never call an
     * independently committing ProofPersistence.complete. completed iff ALL apply.
     * D1 preplans before batch; exact lost guard discards success journal before a
     * separate zero-write rejected receipt. Unknown SQL failure remains unavailable.
     */
    readonly resetWithProof: <A>(
      input: PasswordMutationInput & { readonly completion: ProofCompletionPlan },
      prepare: PreparePasswordCommit<PasswordMutationDecision, A>,
    ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
    readonly cleanupAttempts: <A>(
      input: { readonly moduleId: string; readonly limit: number },
      prepare: PreparePasswordCommit<{ readonly removed: number; readonly hasMore: boolean }, A>,
    ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
  }
>()("effect-auth/PasswordPersistence") {}
