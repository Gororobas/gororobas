import { Context, type Effect, Schema } from "effect";

import { SubjectId } from "../../Schema";

export class Unavailable extends Schema.TaggedError<Unavailable>()("OAuthServerUnavailable", {}) {}

export class InvalidToken extends Schema.TaggedError<InvalidToken>()(
  "OAuthServerInvalidToken",
  {},
) {}

export class ConfigurationError extends Schema.TaggedError<ConfigurationError>()(
  "OAuthServerConfigurationError",
  {},
) {}

export const Text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2048));
export const Random = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/));
export const Scope = Schema.String.check(Schema.isPattern(/^[\x21\x23-\x5B\x5D-\x7E]{1,128}$/));
export const Scopes = Schema.NonEmptyArray(Scope).check(Schema.isMaxLength(32));

export const Client = Schema.Struct({
  clientId: Text,
  name: Text,
  redirectUris: Schema.NonEmptyArray(Text).check(Schema.isMaxLength(16)),
});

export type Client = typeof Client.Type;

/** Private transport payloads: never expose tokens as public workflow results. */
export const TokenResponse = Schema.Struct({
  access_token: Text,
  token_type: Schema.Literal("Bearer"),
  expires_in: Schema.Natural,
  refresh_token: Text,
  scope: Text,
});

export const AuthorizationMetadata = Schema.Struct({
  issuer: Text,
  authorization_endpoint: Text,
  token_endpoint: Text,
  revocation_endpoint: Text,
  response_types_supported: Schema.Array(Schema.Literal("code")),
  grant_types_supported: Schema.Array(Schema.Literals(["authorization_code", "refresh_token"])),
  token_endpoint_auth_methods_supported: Schema.Array(Schema.Literal("none")),
  revocation_endpoint_auth_methods_supported: Schema.Array(Schema.Literal("none")),
  code_challenge_methods_supported: Schema.Array(Schema.Literal("S256")),
  authorization_response_iss_parameter_supported: Schema.Literal(true),
  scopes_supported: Scopes,
});

export const ResourceMetadata = Schema.Struct({
  resource: Text,
  authorization_servers: Schema.NonEmptyArray(Text),
  scopes_supported: Scopes,
  bearer_methods_supported: Schema.Array(Schema.Literal("header")),
});

export const Authorization = Schema.Struct({
  clientId: Text,
  redirectUri: Text,
  scopes: Scopes,
  challenge: Random,
  state: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2048))),
});

export type Authorization = typeof Authorization.Type;

/** One record owns consent, code redemption and the entire refresh family.
 * Revocation is monotonic; a stale CAS must never reactivate a revoked grant.
 * No bearer credentials or provider tokens are persisted here.
 */
export const Record = Schema.Struct({
  version: Random,
  status: Schema.Literals(["Pending", "Consent", "Code", "Active", "Revoked"]),
  authorization: Authorization,
  subjectId: Schema.optionalKey(SubjectId),
  expiresAtMillis: Schema.Natural,
});

export type Record = typeof Record.Type;

export const Access = Schema.Struct({
  subjectId: SubjectId,
  grantId: Random,
  clientId: Text,
  resource: Text,
  scopes: Scopes,
});

export type Access = typeof Access.Type;

/** Request-local authenticated authority. Absent outside protected requests;
 * callers must reject undefined. Never provide a principal at server startup.
 * A Reference models absent authentication without a fake construction-time
 * identity when Effect registers toolkit handlers. MCP client IDs are unrelated.
 */
export const CurrentAccess = Context.Reference<Access | undefined>(
  "effect-auth/OAuthServer/CurrentAccess",
  { defaultValue: () => undefined },
);

/** Linearizable, standalone commits. Never retry an ambiguous insert or CAS.
 * Revoke must atomically disable the record, including against concurrent CAS.
 * Grant IDs must never be reused. Retain records through expiresAtMillis;
 * only then may they be deleted.
 */
export class Persistence extends Context.Service<
  Persistence,
  {
    readonly get: (namespace: string, id: string) => Effect.Effect<Record | undefined, Unavailable>;
    readonly insert: (
      namespace: string,
      id: string,
      record: Record,
    ) => Effect.Effect<boolean, Unavailable>;
    readonly compareAndSet: (
      namespace: string,
      id: string,
      version: string,
      record: Record,
    ) => Effect.Effect<boolean, Unavailable>;
    readonly revoke: (namespace: string, id: string) => Effect.Effect<void, Unavailable>;
  }
>()("effect-auth/OAuthServer/Persistence") {}
