import { Context, type Effect } from "effect";

import type { CommitJournal, PreparedCommit } from "../hooks/commit";
import type { TokenDigest } from "../Schema";
import type { ProofRequestConflict, ProofUnavailable } from "./errors";
import type {
  ProofAttemptDecision,
  ProofBinding,
  ProofCleanupResult,
  ProofCompletionDecision,
  ProofContinuationId,
  ProofDeliveryId,
  ProofDeliveryOutcome,
  ProofId,
  ProofPurpose,
  ProofRequestId,
  ProofRequestReceipt,
  ProofVersion,
} from "./models";
import type { ProofPolicy } from "./policy";

export interface ProofCompletionInput {
  readonly moduleId: string;
  readonly purpose: ProofPurpose;
  readonly continuationId: ProofContinuationId;
  readonly continuationDigest: TokenDigest;
  readonly binding: ProofBinding;
  readonly nowMillis: number;
}

export type PrepareProofCommit<Value, A> = (
  value: Value,
  journal: CommitJournal,
) => PreparedCommit<A>;

export interface ProofDigest {
  readonly keyId: string;
  readonly digest: TokenDigest;
}

export interface ProofRecord {
  readonly moduleId: string;
  readonly purpose: ProofPurpose;
  readonly proofId: ProofId;
  readonly requestId: ProofRequestId;
  readonly fingerprint: TokenDigest;
  readonly deliveryId: ProofDeliveryId;
  readonly binding: ProofBinding;
  readonly verifier: ProofDigest;
  readonly issuedAtMillis: number;
  readonly expiresAtMillis: number;
  readonly version: ProofVersion;
}

export type ProofIssueDecision =
  | { readonly _tag: "Issued"; readonly record: ProofRecord }
  | { readonly _tag: "Existing" | "Suppressed"; readonly receipt: ProofRequestReceipt };

export type ProofDeliveryClaim =
  | { readonly _tag: "Claimed"; readonly claimVersion: ProofVersion }
  | { readonly _tag: "Declined" };

/**
 * Semantic atomic commands, never generic CRUD. Every mutation owns the real
 * transaction/batch and prepares its receipt BEFORE physical commit. Nested
 * commands join the same owner. D1 preallocates final IDs/versions before batch.
 * Use an authoritative fresh clock at each condition; caller timestamps are hints.
 */
export class ProofPersistence extends Context.Service<
  ProofPersistence,
  {
    /**
     * Atomically enforce identifier/subject/action issue windows (independent of
     * flow/context/request IDs) and cooldown. Charge those windows only when a new
     * proof is issued; suppressed and matching replay requests consume no issue budget.
     * Preserve an active predecessor unless replacement has the same canonical
     * binding. Preserve rolling failed-attempt history and send budgets across
     * resends, consumption, cancellation and expiry.
     * Matching request fingerprint returns Existing WITHOUT pairing its stored
     * digest with this attempt's new secret. Mismatched reuse fails Conflict.
     * eligible=false stores a request fingerprint and uniform receipt, but creates
     * no usable proof/delivery. Host ingress admission covers all eligibility cases.
     * Check any captured security/credential/identifier revision against current authority.
     */
    readonly issue: <A>(
      input: {
        readonly record: ProofRecord;
        readonly policy: ProofPolicy;
        readonly eligible: boolean;
        readonly supersedes?: ProofId;
      },
      prepare: PrepareProofCommit<ProofIssueDecision, A>,
    ) => Effect.Effect<PreparedCommit<A>, ProofRequestConflict | ProofUnavailable>;
    /**
     * Charge action/identifier/subject attempt windows even for missing, mismatched,
     * consumed or malformed candidates. Compare only the row's stored keyId.
     * Enforce active generation, exact purpose/binding, current revisions, expiry,
     * rolling failure budget and max failures atomically. One winner consumes proof
     * and creates a digest-only restricted continuation whose expiry is clipped to
     * min(proof.expiresAt, now+continuationLifetime); every rejection is a committed VALUE.
     */
    readonly attempt: <A>(
      input: {
        readonly moduleId: string;
        readonly purpose: ProofPurpose;
        readonly proofId: ProofId;
        readonly binding: ProofBinding;
        readonly candidate?: ProofDigest;
        readonly continuationId: ProofContinuationId;
        readonly continuationDigest: TokenDigest;
        readonly nowMillis: number;
        readonly policy: ProofPolicy;
      },
      prepare: PrepareProofCommit<ProofAttemptDecision, A>,
    ) => Effect.Effect<PreparedCommit<A>, ProofUnavailable>;
    /**
     * Consume a continuation exactly once under matching module/purpose/binding,
     * current revisions and expiry. Method adapters MUST couple this decision and
     * protected credential/identifier/session writes in the same actual owner.
     * The standalone operation chooses burn-on-downstream-failure; its result is
     * never AuthenticationEvidence and cannot itself grant a session.
     */
    readonly complete: <A>(
      input: ProofCompletionInput,
      prepare: PrepareProofCommit<ProofCompletionDecision, A>,
    ) => Effect.Effect<PreparedCommit<A>, ProofUnavailable>;
    /**
     * Persist a bounded send-attempt claim before network I/O. Check exact generation,
     * active/unexpired proof and retry deadline. Concurrent/repeated calls have one
     * claim winner. Expired claims become ambiguous; never reclaim an in-flight send
     * as if it were definitely unsent. Only explicit idempotent-vendor retry may
     * claim after ambiguity, with same deliveryId and within max attempt/lifetime.
     */
    readonly claimDelivery: <A>(
      input: {
        readonly moduleId: string;
        readonly proofId: ProofId;
        readonly version: ProofVersion;
        readonly deliveryId: ProofDeliveryId;
        readonly nowMillis: number;
        readonly policy: ProofPolicy;
        readonly allowAmbiguousRetry: boolean;
      },
      prepare: PrepareProofCommit<ProofDeliveryClaim, A>,
    ) => Effect.Effect<PreparedCommit<A>, ProofUnavailable>;
    /** Conditional on this claim/generation; an old failure cannot cancel a resend. Definite failure invalidates this proof, preserving every budget. */
    readonly settleDelivery: <A>(
      input: {
        readonly moduleId: string;
        readonly proofId: ProofId;
        readonly version: ProofVersion;
        readonly deliveryId: ProofDeliveryId;
        readonly claimVersion: ProofVersion;
        readonly outcome: ProofDeliveryOutcome;
        readonly nowMillis: number;
      },
      prepare: PrepareProofCommit<void, A>,
    ) => Effect.Effect<PreparedCommit<A>, ProofUnavailable>;
    readonly cancel: <A>(
      input: {
        readonly moduleId: string;
        readonly purpose: ProofPurpose;
        readonly binding: ProofBinding;
        readonly nowMillis: number;
      },
      prepare: PrepareProofCommit<void, A>,
    ) => Effect.Effect<PreparedCommit<A>, ProofUnavailable>;
    /** Bounded cleanup retains budgets/fingerprints/tombstones through their own horizons; erase verifiers and delivery material when no longer needed. */
    readonly cleanup: <A>(
      input: { readonly moduleId: string; readonly nowMillis: number; readonly limit: number },
      prepare: PrepareProofCommit<ProofCleanupResult, A>,
    ) => Effect.Effect<PreparedCommit<A>, ProofUnavailable>;
  }
>()("effect-auth/ProofPersistence") {}
