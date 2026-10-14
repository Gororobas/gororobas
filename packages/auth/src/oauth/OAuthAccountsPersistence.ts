import { Context, type Effect } from "effect";

import type { PreparedCommit } from "../hooks/commit";
import type { CleanupResult } from "../persistence/cleanup";
import type { SubjectId } from "../Schema";
import type { SessionInvalidationWindow } from "../sessions/invalidation";
import type {
  OAuthAccountRevision,
  OAuthLinkedAccountsRead,
  OAuthLinkedAccountsListResult,
  OAuthActionAuthorization,
  OAuthCredentialKey,
  OAuthLinkAccess,
  OAuthLinkConsumeDecision,
  OAuthLinkDecision,
  OAuthLinkIssueDecision,
  OAuthLinkFlow,
  OAuthUnlinkDecision,
} from "./accountsModels";
import type { PrepareOAuthCommit } from "./OAuthSignInPersistence";
import type { OAuthUnavailable } from "./signInErrors";
import type {
  OAuthCleanupInput,
  OAuthCredentialSnapshot,
  OAuthModuleId,
  OAuthVerifiedExternalIdentity,
} from "./signInModels";

/** Mutations commit with one physical owner. Reads are nonconsuming snapshots.
 * Unknown outcomes release no receipts and never authorize automatic retry. */
export class OAuthAccountsPersistence extends Context.Service<
  OAuthAccountsPersistence,
  {
    /** Bounded, nonconsuming login inventory. Scope every read to invocation.subjectId
     * and moduleId, recheck active subject/credential authority and identity ownership,
     * and apply current application metadata policy before releasing any item.
     * Denied metadata access returns an empty page. Pages are not a frozen snapshot. */
    readonly list: (
      input: OAuthLinkedAccountsRead,
    ) => Effect.Effect<OAuthLinkedAccountsListResult, OAuthUnavailable>;
    readonly capture: (input: {
      readonly moduleId: typeof OAuthModuleId.Type;
      readonly subjectId: SubjectId;
    }) => Effect.Effect<OAuthAccountRevision | undefined, OAuthUnavailable>;
    readonly issue: <A>(
      input: OAuthLinkFlow,
      prepare: PrepareOAuthCommit<typeof OAuthLinkIssueDecision.Type, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    /** Conditional engine-time deletion checks exact callback and subject binding.
     * form_post may omit the live session subject; deletion still binds the subject
     * sealed at the authenticated begin, and only when that continuation is form_post.
     * Provider exchange begins only after this receipt is confirmed. */
    readonly consume: <A>(
      input: OAuthLinkAccess,
      prepare: PrepareOAuthCommit<typeof OAuthLinkConsumeDecision.Type, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    /** Lock subject first, recheck the stored begin authorization, original revisions
     * and fixed deadline, then enforce unique full-tuple ownership. Link preserves
     * securityRevision, sessions and pending rows, including unchanged links. */
    readonly link: <A>(
      input: { readonly flow: OAuthLinkFlow; readonly identity: OAuthVerifiedExternalIdentity },
      prepare: PrepareOAuthCommit<typeof OAuthLinkDecision.Type, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    readonly readCredential: (
      input: OAuthCredentialKey,
    ) => Effect.Effect<OAuthCredentialSnapshot | undefined, OAuthUnavailable>;
    /** Subject-first authority checks retain a usable primary method and enabled MFA.
     * Remove credential/factor, bump revision and invalidate in this owner. Release
     * ownership only when an indexed same-owner reference predicate proves it unused.
     * An absent credential never proves an earlier successful removal. */
    readonly unlink: <A>(
      input: {
        readonly credential: OAuthCredentialSnapshot;
        readonly authorization: OAuthActionAuthorization;
        readonly invalidation: SessionInvalidationWindow;
      },
      prepare: PrepareOAuthCommit<typeof OAuthUnlinkDecision.Type, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    readonly cleanup: <A>(
      input: OAuthCleanupInput,
      prepare: PrepareOAuthCommit<CleanupResult, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
  }
>()("effect-auth/OAuthAccountsPersistence") {}
