import { Context, type Effect } from "effect";

import type { PreparedCommit } from "../hooks/commit";
import type { SubjectId } from "../Schema";
import type { SessionInvalidationWindow } from "../sessions/invalidation";
import type {
  OAuthAccountRevision,
  OAuthActionAuthorization,
  OAuthLinkAccess,
  OAuthLinkClaim,
  OAuthLinkClaimDecision,
  OAuthLinkDecision,
  OAuthLinkIssueDecision,
  OAuthLinkOutcome,
  OAuthLinkPendingFlow,
  OAuthUnlinkDecision,
  OAuthUnlinkInspection,
} from "./accountsModels";
import type { PrepareOAuthCommit } from "./OAuthSignInPersistence";
import type { OAuthUnavailable } from "./signInErrors";
import type {
  OAuthCleanupInput,
  OAuthCommandId,
  OAuthCredentialSnapshot,
  OAuthModuleId,
} from "./signInModels";

/** Same-owner semantic authority. Prepare is synchronous before physical commit;
 * unknown outcomes discard receipts/events and never replay prepare. Standalone
 * adapters reject ambient owners. No network, raw secrets, provider tokens, Claims
 * or Registration data is accepted. Reads are nonconsuming and confer no CAS right.
 */
export class OAuthAccountsPersistence extends Context.Service<
  OAuthAccountsPersistence,
  {
    /** Active original subject and authoritative credential revisions. Every policy,
     * binding or credential-set change that affects authority advances securityRevision. */
    readonly capture: (input: {
      readonly moduleId: typeof OAuthModuleId.Type;
      readonly subjectId: SubjectId;
    }) => Effect.Effect<OAuthAccountRevision | undefined, OAuthUnavailable>;
    /** Enforce unique module/flow and module/command, exact immutable context/sealed/
     * retention data, active subject, original revisions, independent begin evidence,
     * current enabled factor policy and authority-clock freshness in this same owner. */
    readonly issue: <A>(
      input: {
        readonly flow: OAuthLinkPendingFlow;
        readonly authorization: OAuthActionAuthorization;
      },
      prepare: PrepareOAuthCommit<typeof OAuthLinkIssueDecision.Type, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    /** Before action-factor consumption: check Pending, exact binder/flow/generation/
     * provider/callback/response issuer, original active subject/revisions and expiry.
     * Wrong credentials/subject never consume or terminalize the flow. */
    readonly preflight: (
      input: OAuthLinkAccess,
    ) => Effect.Effect<OAuthLinkPendingFlow | undefined, OAuthUnavailable>;
    /** Repeat every preflight predicate and exact inspected flow, then current fresh
     * complete-action evidence/policy. Single CAS; authority sets fixed claim deadline
     * = claimedAt + captured lifetime. Never reset Pending or renew the lease. */
    readonly claim: <A>(
      input: {
        readonly access: OAuthLinkAccess;
        readonly flow: OAuthLinkPendingFlow;
        readonly claimId: OAuthLinkClaim["claimId"];
        readonly authorization: OAuthActionAuthorization;
      },
      prepare: PrepareOAuthCommit<typeof OAuthLinkClaimDecision.Type, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    /** Exact claim CAS before deadline. Every outcome erases sealed material and
     * terminalizes. Verified repeats active original subject/revisions, current action
     * evidence/policy/freshness, and full provider+canonical issuer+stable subject
     * uniqueness INCLUDING unresolved registration reservations. Never adopt by email.
     * Same-subject connected-only ownership may add a login; another subject conflicts.
     * Existing usable same-subject login may return unchanged. Changed joins credential,
     * shared factor, revision advancement, pending/session/proof invalidation, terminal
     * result and journal. No mutation/event for unchanged. No session is minted.
     */
    readonly settle: <A>(
      input: {
        readonly claim: OAuthLinkClaim;
        readonly outcome: OAuthLinkOutcome;
        readonly authorization: OAuthActionAuthorization;
        readonly invalidation: SessionInvalidationWindow;
        readonly nowMillis: number;
      },
      prepare: PrepareOAuthCommit<typeof OAuthLinkDecision.Type, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    /** Look up durable command first. Exact replay is authenticated safe metadata only
     * for its original currently active subject under current metadata-access policy;
     * no fresh factor is consumed. Compare module/command/subject/requested credential
     * against durable original full intent. Cross-target/subject reuse conflicts.
     * A missing credential/marker proves neither previous ownership nor rollback.
     * New targets must be currently owned OAuth LOGIN credentials, not connected grants.
     */
    readonly inspectUnlink: (input: {
      readonly moduleId: typeof OAuthModuleId.Type;
      readonly subjectId: SubjectId;
      readonly commandId: typeof OAuthCommandId.Type;
      readonly credentialId: string;
    }) => Effect.Effect<typeof OAuthUnlinkInspection.Type, OAuthUnavailable>;
    /** Recheck exact original target/revisions and fresh independent action evidence,
     * current enabled factor policy at authority time. Atomically evaluate POST-delete
     * usable PRIMARY login paths using mapped method eligibility (active/verified/etc),
     * not shared credential status alone. Factor-only TOTP, recovery, pending registration
     * and connected grants do not count. Also retain ability to satisfy enabled factor
     * policy; never silently disable MFA. Concurrent removals leave a viable method.
     * Join login/shared-factor/proof removal, revision advancement, invalidation, immutable
     * command result and journal. Retain full-tuple ownership while a connected reference
     * exists, using an authoritative same-owner reference check when that capability is
     * installed. No generic password store, async canUnlink boolean or read-count-delete.
     * Exact durable replay returns original metadata with replayed=true; no writes,
     * private commands/events/factor consumption. Command identity includes immutable
     * original target tuple/revisions, not a new proof's bytes. Retain unresolved command
     * outcomes; absent markers never justify automatic mutation retry.
     */
    readonly unlink: <A>(
      input: {
        readonly moduleId: typeof OAuthModuleId.Type;
        readonly commandId: typeof OAuthCommandId.Type;
        readonly credential: OAuthCredentialSnapshot;
        readonly authorization: OAuthActionAuthorization;
        readonly invalidation: SessionInvalidationWindow;
        readonly nowMillis: number;
        readonly retentionUntilMillis: number;
      },
      prepare: PrepareOAuthCommit<typeof OAuthUnlinkDecision.Type, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    /** Decode integer limit1..1000. Expire Pending->Rejected and Claimed->Ambiguous;
     * erase sealed material, never reset. Conditional writes recheck authority clock and
     * exact status. Terminal tombstones/commands retained through original retention and
     * claim horizons; unresolved effects/reservations are never released by this cleanup.
     */
    readonly cleanup: <A>(
      input: OAuthCleanupInput,
      prepare: PrepareOAuthCommit<
        { readonly terminalized: number; readonly removed: number; readonly hasMore: boolean },
        A
      >,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
  }
>()("effect-auth/OAuthAccountsPersistence") {}
