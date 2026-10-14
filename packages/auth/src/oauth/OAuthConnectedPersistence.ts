import { Context, type Effect } from "effect";

import type { PreparedCommit } from "../hooks/commit";
import type { CleanupResult } from "../persistence/cleanup";
import type { OAuthAccountRevision } from "./accountsModels";
import type * as M from "./connectedModels";
import type { PrepareOAuthCommit } from "./OAuthSignInPersistence";
import type { OAuthUnavailable } from "./signInErrors";
import type { OAuthClaimId, OAuthCleanupInput } from "./signInModels";

type Mutation<A> = Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;

/** One native authority owns each mutation and its synchronous projection. Unknown
 * commit outcomes release no receipts and authorize no exchange or automatic retry.
 * Reads are advisory; final mutations guard the supplied revision and fixed deadline. */
export class OAuthConnectedPersistence extends Context.Service<
  OAuthConnectedPersistence,
  {
    /** One joined subject/authority/grant read. No token-use admission row. */
    readonly read: (input: M.OAuthConnectedReadInput) => Effect.Effect<
      | {
          readonly revision: OAuthAccountRevision;
          readonly grant?: M.OAuthConnectedGrantSnapshot;
          /** Expected policy revision captured by this read; checked before token decryption. */
          readonly policyRevision?: M.OAuthConnectedUseAuthorization["policyRevision"];
        }
      | undefined,
      OAuthUnavailable
    >;
    readonly issue: <A>(
      input: M.OAuthConnectedFlow,
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedIssueDecision.Type, A>,
    ) => Mutation<A>;
    /** Exact live-flow DELETE with state/binder/issuer/engine-expiry predicates.
     * A confirmed consumed snapshot permits one exchange. */
    readonly consume: <A>(
      input: M.OAuthConnectedAccess,
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedConsumeDecision.Type, A>,
    ) => Mutation<A>;
    /** Unique ownership plus sealed grant write. Reconnect matches its original
     * grant/version and changes grantVersion. Sign-in retains before issuing a session. */
    readonly settle: <A>(
      input: M.OAuthConnectedSettlement,
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedSettlementDecision.Type, A>,
    ) => Mutation<A>;
    readonly list: (input: {
      readonly authorization: M.OAuthConnectedUseAuthorization;
      readonly limit: (typeof M.OAuthConnectedList.Type)["limit"];
      readonly cursor?: string;
    }) => Effect.Effect<typeof M.OAuthConnectedListResult.Type, OAuthUnavailable>;
    /** Remove by exact subject/grant/grantVersion, independent of token rotation.
     * Optional revocation custody copies the persisted ciphertext in this owner.
     * Release ownership only when no concrete login/grant/job reference remains.
     * An already released or in-flight token cannot be recalled by this mutation. */
    readonly disconnect: <A>(
      input: {
        readonly key: M.OAuthConnectedGrantKey;
        readonly grantVersion: M.OAuthConnectedTarget["grantVersion"];
        readonly authorization: M.OAuthConnectedActionAuthorization;
      },
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedDisconnectDecision.Type, A>,
    ) => Mutation<A>;
    /** Match the original sealed snapshot, Active state and grant/token versions
     * in one conditional claim. No expired takeover or prerequisite grant reread.
     * A lost response authorizes no exchange. Deadline uses the database clock. */
    readonly claimRefresh: <A>(
      input: {
        readonly grant: M.OAuthConnectedStoredGrant;
        readonly authorization: M.OAuthConnectedUseAuthorization;
        readonly claimId: typeof OAuthClaimId.Type;
        readonly nextTokenVersion: M.OAuthConnectedRefreshClaim["nextTokenVersion"];
        readonly lifetimeMillis: number;
      },
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedRefreshDecision.Type, A>,
    ) => Mutation<A>;
    /** UPDATE only: exact original versions, claim, Refreshing state and deadline.
     * Late results never recreate a disconnected/reconnected grant. Unknown refresh
     * leaves material unusable; cleanup never restores Active. */
    readonly settleRefresh: <A>(
      input: {
        readonly claim: M.OAuthConnectedRefreshClaim;
        readonly authorization: M.OAuthConnectedUseAuthorization;
        readonly outcome: M.OAuthConnectedRefreshOutcome;
      },
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedRefreshSettlement.Type, A>,
    ) => Mutation<A>;
    readonly cleanup: <A>(
      input: OAuthCleanupInput,
      prepare: PrepareOAuthCommit<CleanupResult, A>,
    ) => Mutation<A>;
  }
>()("effect-auth/OAuthConnectedPersistence") {}
