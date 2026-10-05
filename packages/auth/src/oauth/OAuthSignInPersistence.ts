import { Context, type Effect } from "effect";

import type { CommitJournal, PreparedCommit } from "../hooks/commit";
import type { RequestBindingFlowId } from "../operations/requestBinding";
import type { TokenDigest } from "../Schema";
import type { OAuthProviderKey } from "./schema";
import type { OAuthUnavailable } from "./signInErrors";
import type {
  OAuthCallbackId,
  OAuthClaim,
  OAuthClaimDecision,
  OAuthClaimId,
  OAuthCleanupInput,
  OAuthIssueDecision,
  OAuthIssuer,
  OAuthModuleId,
  OAuthPendingFlow,
  OAuthSettlementDecision,
  OAuthVerifiedExternalIdentity,
} from "./signInModels";

export type PrepareOAuthCommit<Value, A> = (
  value: Value,
  journal: CommitJournal,
) => PreparedCommit<A>;

/** Semantic commands with one physical authority per call. Prepare is synchronous
 * and runs before commit; unknown outcomes discard receipts. No callback replay.
 * Standalone adapters reject ambient owners; bound services share an explicit owner.
 * No method accepts a bearer, callback code, plaintext transaction secret, or Claims.
 */
export class OAuthSignInPersistence extends Context.Service<
  OAuthSignInPersistence,
  {
    /** Duplicate module/flow or module/command rejects; never return an existing row. */
    readonly issue: <A>(
      input: OAuthPendingFlow,
      prepare: PrepareOAuthCommit<OAuthIssueDecision, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    /** Atomically check Pending, module/generation/provider/callback/state/binder,
     * authoritative expiry, and required/unsupported response issuer. Wrong binding
     * does not mutate. Only one claim; no reset, lease renewal or re-exchange.
     * Use authority time; set claimExpiresAt = claimedAt + captured claimLifetime.
     */
    readonly claim: <A>(
      input: {
        readonly moduleId: typeof OAuthModuleId.Type;
        readonly generation: number;
        readonly flowId: RequestBindingFlowId;
        readonly provider: OAuthProviderKey;
        readonly callbackId: typeof OAuthCallbackId.Type;
        readonly stateDigest: TokenDigest;
        readonly requestBindingVerifier: TokenDigest;
        readonly requestBindingExpiresAtMillis: number;
        readonly responseIssuer?: typeof OAuthIssuer.Type;
        readonly claimId: typeof OAuthClaimId.Type;
        readonly nowMillis: number;
      },
      prepare: PrepareOAuthCommit<OAuthClaimDecision, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    /** CAS exact claim/context/generation before the captured deadline. Erase sealed
     * material on every terminal result. Verified resolves the full external tuple
     * to an active subject, usable OAuth credential and matching shared factor in
     * this same owner. No match commits Rejected, with no provisioning or session.
     * A stale claim rejects; infrastructure/unknown outcome is unavailable.
     */
    readonly settle: <A>(
      input: {
        readonly claim: OAuthClaim;
        readonly outcome:
          | { readonly _tag: "Verified"; readonly identity: OAuthVerifiedExternalIdentity }
          | { readonly _tag: "Cancelled" | "Rejected" | "Ambiguous" };
        readonly nowMillis: number;
      },
      prepare: PrepareOAuthCommit<OAuthSettlementDecision, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    /** At most limit rows: expire Pending -> Rejected and Claimed -> Ambiguous,
     * erasing sealed material; never make them Pending again. Remove terminal
     * tombstones only after their original retentionUntil and claim deadline.
     * Decode OAuthCleanupInput (integer limit 1..1000) before querying.
     * Re-read authority time and exact status/version for each conditional write.
     */
    readonly cleanup: <A>(
      input: OAuthCleanupInput,
      prepare: PrepareOAuthCommit<
        { readonly terminalized: number; readonly removed: number; readonly hasMore: boolean },
        A
      >,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
  }
>()("effect-auth/OAuthSignInPersistence") {}
