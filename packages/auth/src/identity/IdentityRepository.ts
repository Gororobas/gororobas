import { Context, type Effect, type Option } from "effect";

import type { SubjectId } from "../Schema";
import type {
  CredentialSummary,
  ExternalIdentity,
  IdentifierBinding,
  IdentityUnavailable,
  LoginIdentifier,
  SubjectSnapshot,
} from "./models";

/**
 * Application identity queries. No profile fields, email requirement, table
 * layout, or account-creation side effect is implied by resolving an identity.
 */
export class IdentityRepository extends Context.Service<
  IdentityRepository,
  {
    readonly findSubject: (
      subjectId: SubjectId,
    ) => Effect.Effect<Option.Option<SubjectSnapshot>, IdentityUnavailable>;
    readonly findIdentifier: (
      identifier: LoginIdentifier,
    ) => Effect.Effect<Option.Option<IdentifierBinding>, IdentityUnavailable>;
    /** Resolve the full configured provider + issuer + external subject tuple. */
    readonly findExternalIdentity: (
      identity: ExternalIdentity,
    ) => Effect.Effect<Option.Option<SubjectId>, IdentityUnavailable>;
    readonly listIdentifiers: (
      subjectId: SubjectId,
    ) => Effect.Effect<ReadonlyArray<IdentifierBinding>, IdentityUnavailable>;
    readonly listCredentials: (
      subjectId: SubjectId,
    ) => Effect.Effect<ReadonlyArray<CredentialSummary>, IdentityUnavailable>;
  }
>()("effect-auth/IdentityRepository") {}
