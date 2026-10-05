import { Context, type Effect } from "effect";

import type { PreparedCommit } from "../hooks/commit";
import type { SubjectId } from "../Schema";
import type { OAuthAccountRevision } from "./accountsModels";
import type * as M from "./connectedModels";
import type { PrepareOAuthCommit } from "./OAuthSignInPersistence";
import type {
  OAuthSignInAccessClaim,
  OAuthSignInAccessInspection,
  OAuthSignInAccessOutcome,
} from "./signInAccessModels";
import type { OAuthUnavailable } from "./signInErrors";
import type {
  OAuthClaim,
  OAuthCredentialSnapshot,
  OAuthClaimId,
  OAuthCleanupInput,
  OAuthCommandId,
  OAuthExternalIdentity,
  OAuthModuleId,
} from "./signInModels";

type Mutation<A> = Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;

/** All joins use ONE physical authority. Synchronous prepare before commit; unknown
 * outcomes discard receipts/events, never retry prepare/owner/network. No plaintext.
 * Every relevant policy/binding change advances its authority revision. Final guards
 * recheck exact input, subject, credential/policy/profile/cohort versions and engine
 * time after all writes. Standalone operations reject ambient owners. */
export class OAuthConnectedPersistence extends Context.Service<
  OAuthConnectedPersistence,
  {
    /** Reserve client order before a guest sign-in exchanges its code. A lost
     * receipt never authorizes exchange or a second reservation. Unresolved
     * reservations remain visible to cohort revocation and ownership cleanup. */
    readonly claimSignIn: <A>(
      input: { readonly claim: OAuthClaim; readonly configuration: M.OAuthConnectedConfiguration },
      prepare: PrepareOAuthCommit<OAuthSignInAccessClaim, A>,
    ) => Mutation<A>;
    /** Resolve the grant slot only after shared sign-in resolved the local
     * credential. Recheck ownership, revisions, policy and cohort order. */
    readonly inspectSignIn: (input: {
      readonly reservation: OAuthSignInAccessClaim;
      readonly credential: OAuthCredentialSnapshot;
      readonly grantId: typeof M.OAuthGrantId.Type;
    }) => Effect.Effect<OAuthSignInAccessInspection, OAuthUnavailable>;
    /** Commit sealed tokens into the ordinary connected-grant store. Exact
     * reservation/target/revisions are rechecked; no session is released before
     * confirmation. `Unissued` resolves the reservation. `Rejected` and unknown
     * exchanges keep unresolved cohort work. */
    readonly settleSignIn: <A>(
      input: {
        readonly reservation: OAuthSignInAccessClaim;
        readonly outcome: OAuthSignInAccessOutcome;
      },
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedSettlementDecision.Type, A>,
    ) => Mutation<A>;
    readonly capture: (input: {
      readonly moduleId: typeof OAuthModuleId.Type;
      readonly subjectId: SubjectId;
      readonly grantId?: typeof M.OAuthGrantId.Type;
    }) => Effect.Effect<
      | { readonly revision: OAuthAccountRevision; readonly target?: M.OAuthConnectedTarget }
      | undefined,
      OAuthUnavailable
    >;
    /** Promote the exact retained Prepared flow to Pending under current action
     * authority. Reject missing, changed, expired or already-issued preparations;
     * never insert a replacement flow or refresh its binding and deadlines. */
    readonly issue: <A>(
      input: {
        readonly flow: M.OAuthConnectedPendingFlow;
        readonly authorization: M.OAuthConnectedActionAuthorization;
      },
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedIssueDecision.Type, A>,
    ) => Mutation<A>;
    /** Retain one sealed preparation under current metadata authority. No code
     * exchange or callback claim is permitted before exact-action issuance. */
    readonly prepare: <A>(
      input: {
        readonly flow: M.OAuthConnectedPendingFlow;
        readonly authorization: M.OAuthConnectedUseAuthorization;
      },
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedIssueDecision.Type, A>,
    ) => Mutation<A>;
    /** Server-only target resolution. Match original bearer/command and current
     * subject revisions under the authority clock; never refresh the snapshot. */
    readonly inspectPrepared: (
      input: M.OAuthConnectedPreparedAccess,
    ) => Effect.Effect<M.OAuthConnectedPendingFlow | undefined, OAuthUnavailable>;
    readonly preflight: (
      input: M.OAuthConnectedAccess,
    ) => Effect.Effect<M.OAuthConnectedPendingFlow | undefined, OAuthUnavailable>;
    /** Single Pending->Claimed CAS with fixed engine deadline. Assign durable total
     * order comparable with later-resolved cohort cutoff; never use caller clock. */
    readonly claim: <A>(
      input: {
        readonly access: M.OAuthConnectedAccess;
        readonly flow: M.OAuthConnectedPendingFlow;
        readonly claimId: typeof OAuthClaimId.Type;
        readonly authorization: M.OAuthConnectedActionAuthorization;
      },
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedClaimDecision.Type, A>,
    ) => Mutation<A>;
    /** Nonconsuming current cohort/ownership inspection after identity is known.
     * Neither this read nor its generation confers a final mutation right.
     * A recognized cutoff/barrier rejection returns Quarantine with its actual
     * generation so late tokens can be sealed into exact cohort custody. Foreign
     * ownership conflicts do not authorize compensating remote revocation. */
    readonly inspectGrant: (input: {
      readonly claim: M.OAuthConnectedClaim;
      readonly identity: typeof OAuthExternalIdentity.Type;
    }) => Effect.Effect<typeof M.OAuthConnectedGrantInspection.Type, OAuthUnavailable>;
    /** Recheck complete action, original revisions/deadline, global tuple INCLUDING
     * unresolved registration reservations, exact profile/target/cohort and claim
     * order after revocation cutoff. Connect cannot overwrite; Reconnect keeps tuple.
     * Join token ciphertext, ownership, flow erasure, result and journal. Verified
     * includes sealed cleanup for a cutoff advanced since inspectGrant; route it into
     * original cohort custody instead of activating. Quarantined can ONLY join sealed
     * cleanup custody, never Active. No login
     * credential/factor/session mutation. `Unissued` resolves the flow. `Rejected`
     * stays unresolved. Unknown outcome MUST NOT trigger revoke. */
    readonly settle: <A>(
      input: {
        readonly claim: M.OAuthConnectedClaim;
        readonly outcome: M.OAuthConnectedOutcome;
        readonly authorization: M.OAuthConnectedActionAuthorization;
        readonly nowMillis: number;
      },
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedSettlementDecision.Type, A>,
    ) => Mutation<A>;
    readonly list: (input: {
      readonly authorization: M.OAuthConnectedUseAuthorization;
      readonly limit: number;
      readonly cursor?: string;
    }) => Effect.Effect<typeof M.OAuthConnectedListResult.Type, OAuthUnavailable>;
    /** Durable command first, current metadata policy on replay; no new factor.
     * Missing marker/target proves neither prior ownership nor rollback. */
    readonly inspectDisconnect: (input: {
      readonly moduleId: typeof OAuthModuleId.Type;
      readonly subjectId: SubjectId;
      readonly authorization: M.OAuthConnectedUseAuthorization;
      readonly commandId: typeof OAuthCommandId.Type;
      readonly grantId: typeof M.OAuthGrantId.Type;
    }) => Effect.Effect<typeof M.OAuthConnectedDisconnectInspection.Type, OAuthUnavailable>;
    /** Local-first: atomic disable + generation/cohort barrier + immutable command +
     * optional sealed revocation jobs. Conservative cohort-wide sibling invalidation.
     * Pending refresh counts as unresolved. Retain global ownership while any login,
     * grant, reservation, admission or unresolved cohort work needs it. No remote I/O. */
    readonly disconnect: <A>(
      input: {
        readonly moduleId: typeof OAuthModuleId.Type;
        readonly commandId: typeof OAuthCommandId.Type;
        readonly grant: M.OAuthConnectedDisconnectGrant;
        readonly authorization: M.OAuthConnectedActionAuthorization;
        readonly revocation?: M.OAuthConnectedRevocationJob;
        readonly retentionUntilMillis: number;
      },
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedDisconnectDecision.Type, A>,
    ) => Mutation<A>;
    readonly inspectAccess: (input: {
      readonly authorization: M.OAuthConnectedUseAuthorization;
      readonly grantId: typeof M.OAuthGrantId.Type;
      readonly profileKey: typeof M.OAuthPermissionProfileKey.Type;
    }) => Effect.Effect<typeof M.OAuthConnectedAccessInspection.Type, OAuthUnavailable>;
    /** One fixed claim only when due, exact grant/token/cohort/use authority. Busy
     * losers, no expired takeover/reset/renewal. Claimed work blocks cohort clearing. */
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
    /** Exact CAS plus final policy/time. Late success never resurrects: route its
     * sealed cleanup to original unresolved cohort; old-token revoke alone cannot
     * clear pending work. Ambiguous/expired claim invalidates both token uses and
     * retains unresolved state; no future reuse of possibly spent refresh material. */
    readonly settleRefresh: <A>(
      input: {
        readonly claim: M.OAuthConnectedRefreshClaim;
        readonly authorization: M.OAuthConnectedUseAuthorization;
        readonly outcome: M.OAuthConnectedRefreshOutcome;
      },
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedRefreshSettlement.Type, A>,
    ) => Mutation<A>;
    /** AFTER decrypt, exact ciphertext/context+grant/token/cohort, active subject,
     * current policy/revisions/profile/permissions and engine expiry. One confirmed
     * admission receipt authorizes at most one callback; it does not prove I/O ran. */
    readonly admitUse: <A>(
      input: {
        readonly grant: M.OAuthConnectedStoredGrant;
        readonly authorization: M.OAuthConnectedUseAuthorization;
        readonly admissionId: typeof OAuthClaimId.Type;
        readonly lifetimeMillis: number;
      },
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedUseAdmission.Type, A>,
    ) => Mutation<A>;
    /** Bounded conditional cleanup; never remove unresolved initial exchanges,
     * refresh/revocation, ownership or cohort cutoffs, or turn expired work into new
     * authority. Unknown external tuples retain a conservative client-registration
     * dependency until exact cohort reconciliation or proven provider quiescence;
     * ordinary flow retention expiry cannot release that ordering dependency. */
    readonly cleanup: <A>(
      input: OAuthCleanupInput,
      prepare: PrepareOAuthCommit<typeof M.OAuthConnectedCleanupResult.Type, A>,
    ) => Mutation<A>;
  }
>()("effect-auth/OAuthConnectedPersistence") {}
