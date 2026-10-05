import { Context, type Effect } from "effect";

import type { CommitJournal, PreparedCommit } from "../hooks/commit";
import type { PasskeyUnavailable } from "./errors";
import type {
  PasskeyAccess,
  PasskeyAssertionVerified,
  PasskeyCeremony,
  PasskeyClaim,
  PasskeyClaimDecision,
  PasskeyCleanupResult,
  PasskeyCredential,
  PasskeyEvidence,
  PasskeyIssueDecision,
  PasskeySettlement,
} from "./models";
import type { PasskeyMethodPolicy } from "./policy";

export type PreparePasskeyCommit<Value, A> = (
  value: Value,
  journal: CommitJournal,
) => PreparedCommit<A>;

/** Same-owner authority. Synchronous generic prepare precedes physical commit.
 * Unknown/caught-child/rollback discards all receipts and events; no owner retry.
 * Claim-before-verifier is mandatory. Nothing accepts raw response or bearer. */
export class PasskeyPersistence extends Context.Service<
  PasskeyPersistence,
  {
    /** Unique module/flow + command. Exact challenge, context and binder; durable
     * global/subject/target rolling budgets and pending caps at authority time.
     * Duplicate never returns old ceremony with a new binder. Retain charge windows. */
    readonly issue: <A>(
      input: { readonly ceremony: PasskeyCeremony; readonly policy: PasskeyMethodPolicy },
      prepare: PreparePasskeyCommit<PasskeyIssueDecision, A>,
    ) => Effect.Effect<PreparedCommit<A>, PasskeyUnavailable>;
    readonly context: (
      input: PasskeyAccess,
    ) => Effect.Effect<PasskeyCeremony | undefined, PasskeyUnavailable>;
    /** Recheck exact Pending/context/config/binder/current revisions/expiry and
     * the immutable issue policy. Atomically charge the newly resolved subject
     * for discoverable flows whose subject was unknown at issue; retain known
     * subject/target issue charges through full physical rolling windows. Serialize
     * the subject budget decision with claim so different flows cannot bypass it.
     * Optional credential authority is captured before signature verification.
     * One fixed claim; no takeover, lease renewal or return to Pending. Claim
     * timestamps use the persistence authority's clock, which may differ from the
     * application's clock. The core bounds verification by the granted duration;
     * persistence must recheck liveness at final authority time before committing. */
    readonly claim: <A>(
      input: {
        readonly access: PasskeyAccess;
        readonly policy: PasskeyMethodPolicy;
        readonly ceremony: PasskeyCeremony;
        readonly claimId: string;
        readonly credential?: PasskeyCredential;
      },
      prepare: PreparePasskeyCommit<PasskeyClaimDecision, A>,
    ) => Effect.Effect<PreparedCommit<A>, PasskeyUnavailable>;
    /** Every outcome terminalizes. Verified checks original active subject, full
     * credential/key/profile/handle/BE and semantic revisions at final engine time.
     * Single-device: zero/zero or strict positive increase against current counter.
     * Multi-device: allow zero/reset/out-of-order; atomically merge max and BS without
     * telemetry CAS rejecting another valid challenge. No semantic revision bump.
     * Recheck all postconditions AFTER final writes; failures roll back everything. */
    readonly settle: <A>(
      input: {
        readonly claim: PasskeyClaim;
        readonly outcome:
          | { readonly _tag: "Rejected" | "Ambiguous" }
          | {
              readonly _tag: "Assertion";
              readonly credential: PasskeyCredential;
              readonly assertion: PasskeyAssertionVerified;
              readonly evidence: typeof PasskeyEvidence.Type;
            };
        readonly nowMillis: number;
      },
      prepare: PreparePasskeyCommit<PasskeySettlement, A>,
    ) => Effect.Effect<PreparedCommit<A>, PasskeyUnavailable>;
    /** Expired Pending->Rejected, Claimed->Ambiguous, never reopen. Keep claim and
     * charge/replay horizons and unresolved registration; bounded authority-time CAS. */
    readonly cleanup: <A>(
      input: { readonly moduleId: string; readonly nowMillis: number; readonly limit: number },
      prepare: PreparePasskeyCommit<PasskeyCleanupResult, A>,
    ) => Effect.Effect<PreparedCommit<A>, PasskeyUnavailable>;
  }
>()("effect-auth/PasskeyPersistence") {}
