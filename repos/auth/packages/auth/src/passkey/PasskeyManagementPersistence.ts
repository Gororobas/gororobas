import { Context, type Effect } from "effect";

import type { PreparedCommit } from "../hooks/commit";
import type { SubjectId } from "../Schema";
import type { SessionInvalidationWindow } from "../sessions/invalidation";
import type { PasskeyUnavailable } from "./errors";
import type {
  PasskeyActionAuthorization,
  PasskeyCeremony,
  PasskeyClaim,
  PasskeyCredential,
  PasskeyCredentialSummary,
  PasskeyIssueDecision,
  PasskeyRegistrationVerified,
  PasskeyRemoved,
} from "./models";
import type { PreparePasskeyCommit } from "./PasskeyPersistence";
import type { PasskeyManagementPolicy, PasskeyMethodPolicy } from "./policy";

/** Optional same-owner composites. Global (rpId,id)/(rpId,handle) ownership spans
 * all modules/profile aliases and unresolved registrations. No network or Claims. */
export class PasskeyManagementPersistence extends Context.Service<
  PasskeyManagementPersistence,
  {
    /** Active current metadata-access policy and ownership, including replay. */
    readonly list: (input: {
      readonly moduleId: string;
      readonly subjectId: SubjectId;
      readonly cursor?: string;
      readonly limit: number;
    }) => Effect.Effect<
      { readonly credentials: ReadonlyArray<PasskeyCredentialSummary>; readonly cursor?: string },
      PasskeyUnavailable
    >;
    /** Exact action authority, exclusion set, proposed existing/absent handle and
     * credential cap + durable admission + Pending ceremony in one owner. */
    readonly issueEnrollment: <A>(
      input: {
        readonly ceremony: PasskeyCeremony;
        readonly policy: PasskeyMethodPolicy;
        readonly management: PasskeyManagementPolicy;
        readonly authorization: PasskeyActionAuthorization;
      },
      prepare: PreparePasskeyCommit<PasskeyIssueDecision, A>,
    ) => Effect.Effect<PreparedCommit<A>, PasskeyUnavailable>;
    /** Repeat original+current requirements and all revisions/freshness at final
     * clock, exact claim/key/handle/RP/global uniqueness and count. Join credential,
     * shared factor and terminal event atomically. Preserve subject security revision
     * and existing authentication; enrollment neither issues nor refreshes a session
     * and never creates AuthenticationEvidence. Primary eligibility
     * requires the persisted enrollment profile AND verified UV, never later promotion. */
    readonly completeEnrollment: <A>(
      input: {
        readonly claim: PasskeyClaim;
        readonly verified: PasskeyRegistrationVerified;
        readonly authorization: PasskeyActionAuthorization;
        readonly management: PasskeyManagementPolicy;
        readonly nowMillis: number;
      },
      prepare: PreparePasskeyCommit<
        | { readonly _tag: "Enrolled"; readonly credential: PasskeyCredentialSummary }
        | { readonly _tag: "Rejected" },
        A
      >,
    ) => Effect.Effect<PreparedCommit<A>, PasskeyUnavailable>;
    /** Authenticated exact command replay before fresh action input is consumed.
     * Wrong command/subject/target reuse rejects; missing row never proves rollback. */
    readonly inspectRemove: (input: {
      readonly moduleId: string;
      readonly subjectId: SubjectId;
      readonly commandId: string;
      readonly credentialId: string;
    }) => Effect.Effect<
      | { readonly _tag: "Target"; readonly credential: PasskeyCredential }
      | { readonly _tag: "Replay"; readonly result: typeof PasskeyRemoved.Type }
      | { readonly _tag: "Rejected" },
      PasskeyUnavailable
    >;
    /** Current independent action authority and last usable primary/recovery/factor
     * policy in SAME owner; factor-only and connected grants are not alternatives.
     * Concurrent removals leave a usable path. Remove credential/shared factor,
     * bump semantic+subject revisions, terminalize dependent ceremonies, invalidate
     * under declared strategy, retain exact command. Repeat postconditions last. */
    readonly remove: <A>(
      input: {
        readonly moduleId: string;
        readonly commandId: string;
        readonly credential: PasskeyCredential;
        readonly authorization: PasskeyActionAuthorization;
        readonly management: PasskeyManagementPolicy;
        readonly invalidation: SessionInvalidationWindow;
        readonly nowMillis: number;
        readonly retentionUntilMillis: number;
      },
      prepare: PreparePasskeyCommit<
        | { readonly _tag: "Removed"; readonly result: typeof PasskeyRemoved.Type }
        | { readonly _tag: "Rejected" | "LastSignInMethod" },
        A
      >,
    ) => Effect.Effect<PreparedCommit<A>, PasskeyUnavailable>;
    /** Safe metadata only, no semantic revision bump. Current active owner/policy
     * and exact original name/target on replay; conflicting command reuse rejects. */
    readonly rename: <A>(
      input: {
        readonly moduleId: string;
        readonly subjectId: SubjectId;
        readonly commandId: string;
        readonly credentialId: string;
        readonly name: string;
        readonly nowMillis: number;
        readonly retentionUntilMillis: number;
      },
      prepare: PreparePasskeyCommit<
        | {
            readonly _tag: "Renamed";
            readonly credential: PasskeyCredentialSummary;
            readonly replayed: boolean;
          }
        | { readonly _tag: "Rejected" },
        A
      >,
    ) => Effect.Effect<PreparedCommit<A>, PasskeyUnavailable>;
  }
>()("effect-auth/PasskeyManagementPersistence") {}
