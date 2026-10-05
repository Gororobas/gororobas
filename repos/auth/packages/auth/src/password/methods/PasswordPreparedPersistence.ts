import type { Effect } from "effect";

import type { PreparedCommit } from "../../hooks/commit";
import type { ProofCompletionPlan } from "../../proofs/completion";
import type { ProofCompletionInput } from "../../proofs/ProofPersistence";
import type { SubjectId } from "../../Schema";
import type { SessionInvalidationWindow } from "../../sessions/invalidation";
import type { AuthenticationRequirement } from "../../sessions/models";
import type { PasswordUnavailable, PasswordRejected } from "./errors";
import type { PasswordAction, PasswordCommandId, PasswordMutationDecision } from "./models";
import type { PasswordMutationInput, PreparePasswordCommit } from "./PasswordPersistence";
import type {
  PasswordPreparedConfiguration,
  PasswordPreparedIntentId,
  PasswordPreparedReady,
  PasswordPreparedReservation,
  PasswordPreparedReset,
} from "./preparedModels";

export interface PasswordPreparedMutation {
  readonly intent: PasswordPreparedReady;
  readonly mutation: PasswordMutationInput;
  readonly capturedRequirement: AuthenticationRequirement;
  readonly currentRequirement: AuthenticationRequirement;
  readonly nowMillis: number;
}

export type PasswordPreparedReserveDecision =
  | { readonly _tag: "Existing" }
  | { readonly _tag: "Reserved"; readonly reservation: PasswordPreparedReservation };

/** Optional semantic authority, separate from ordinary PasswordPersistence. Every
 * callback is synchronous preparation before the actual root commit. A self-owned
 * method rejects an ambient owner it cannot join. Never compose independently
 * committed password, intent or proof writes to implement these commands.
 */
export interface PasswordPreparedPersistence {
  /** Committed admission before KDF. Enforce module/command uniqueness across all
   * actions and subjects through retention, action+subject rolling budgets and
   * active Preparing+Ready cap. For the admission identifier bucket use the
   * known canonical credential identifier, or the subject key for Add; the
   * admission counters and reservation must commit under the SAME authority.
   * Cap/budget denial is PasswordUnavailable, never Existing; no denial charge
   * commit is required. Return Existing only after the action's authority check. A winner
   * captures current subject/credential revisions and authoritative ACTION policy
   * in the same owner. Change/Reset require an existing exact credential; Add absence.
   * Reset repeats supplied proof preflight but does not consume it. No takeover or
   * resume of Preparing; a crashed winner needs a new command. */
  readonly reserve: <A>(
    input: {
      readonly moduleId: string;
      readonly generation: number;
      readonly intentId: PasswordPreparedIntentId;
      readonly commandId: PasswordCommandId;
      readonly action: PasswordAction;
      readonly subjectId: SubjectId;
      readonly nowMillis: number;
      readonly policy: PasswordPreparedConfiguration;
      readonly invalidation: SessionInvalidationWindow;
      readonly reset?: PasswordPreparedReset;
      readonly completion?: ProofCompletionInput;
    },
    prepare: PreparePasswordCommit<PasswordPreparedReserveDecision, A>,
  ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
  /** Exact Preparing version/current revision/lease CAS; attach immutable material,
   * never overwrite or return another Ready. A changed transition owns this matching
   * digest and bearer. Unknown commit remains unavailable, never reissues a bearer. */
  readonly publishReady: <A>(
    input: {
      readonly reservation: PasswordPreparedReservation;
      readonly ready: PasswordPreparedReady;
      readonly nowMillis: number;
    },
    prepare: PreparePasswordCommit<"published" | "rejected", A>,
  ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
  /** Ready only: recheck module/generation/digest/time, active subject, identifier,
   * semantic and verifier CAS plus current ACTION policy. No Claims decoder. */
  readonly context: (input: {
    readonly moduleId: string;
    readonly generation: number;
    readonly digest: PasswordPreparedReady["digest"];
    readonly nowMillis: number;
  }) => Effect.Effect<
    {
      readonly record: PasswordPreparedReady;
      readonly currentRequirement: AuthenticationRequirement;
    },
    PasswordRejected | PasswordUnavailable
  >;
  /** ONE owner consumes exact Ready/version/digest, applies Add/Replace, semantic
   * revision bumps, required invalidation and command marker. At commit clock check
   * provider AND captured AND current action requirements, all original revision
   * entries and Change proof timestamps. Re-read under subject→identifier→sorted
   * credentials→intent lock order. Exact zero-write postconditions roll back all.
   * Every authoritative ACTION-policy change must atomically bump subject
   * securityRevision; this fences queued D1 changes without a policy-only read.
   * Native/D1 known losers may create an adapter-owned rejected receipt; never replay
   * a consumer callback or an unknown batch. */
  readonly complete: <A>(
    input: PasswordPreparedMutation,
    prepare: PreparePasswordCommit<PasswordMutationDecision, A>,
  ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
  /** Same transition plus original exact proof continuation consume. The supplied
   * plan was recreated with its original bearer, not serialized from the intent. */
  readonly resetWithProof: <A>(
    input: PasswordPreparedMutation & { readonly completion: ProofCompletionPlan },
    prepare: PreparePasswordCommit<PasswordMutationDecision, A>,
  ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
  /** Cancel only this live digest/version. Retain command tombstone/admission through
   * retainUntil; cancellation never makes old command IDs available for takeover. */
  readonly cancel: <A>(
    input: { readonly record: PasswordPreparedReady; readonly nowMillis: number },
    prepare: PreparePasswordCommit<boolean, A>,
  ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
  /** Bounded, authoritative hasMore. Erase expired sensitive material while retaining
   * command tombstones and active admission charges until their independent horizons.
   * Touch at most limit distinct records, including erase-only tombstones. removed
   * counts fully deleted rows; hasMore covers remaining due erasure OR deletion. */
  readonly cleanup: <A>(
    input: { readonly moduleId: string; readonly limit: number; readonly nowMillis: number },
    prepare: PreparePasswordCommit<{ readonly removed: number; readonly hasMore: boolean }, A>,
  ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
}
