/** Direct PostgreSQL and SQLite owners for upstream OAuth. Factories capture
 * dependencies at construction and validate physical storage on first use.
 * Provider exchange stays outside these transactions. */
import { CurrentCommitJournal, hasCommitScope, type LifecycleHooks } from "@yielded/auth/Hooks";
import {
  OAuthAccountsPersistence,
  OAuthSignInPersistence,
  OAuthRegistrationIntents,
  OAuthConnectedPersistence,
  OAuthConnectedRevocations,
  OAuthUnavailable,
} from "@yielded/auth/OAuth";
import { reportAuthDiagnostic } from "@yielded/auth/Persistence";
import { Context, type Crypto, Effect, Predicate, Schema } from "effect";
import { SqlClient } from "effect/sql";

import { PersistenceConfigurationError } from "./internal/configuration";
import { makeNativeSqlTables } from "./internal/native-sql-table";
import {
  makeNativeOAuthAccountsServices,
  type OAuthNativeAccountsMapping,
} from "./internal/oauth/native-accounts";
import { makeNativeOAuthConnectedServices } from "./internal/oauth/native-connected";
import type { OAuthNativeConnectedMapping } from "./internal/oauth/native-connected-state";
import {
  makeNativeOAuthRegistrationIntentServices,
  makeNativeOAuthRegistrationServices,
  type OAuthNativeRegistrationIntentMapping,
  type OAuthNativeRegistrationMapping,
} from "./internal/oauth/native-registration";
import {
  makeNativeOAuthRevocationServices,
  type OAuthNativeRevocationMapping,
} from "./internal/oauth/native-revocations";
import { makeNativeOAuthSignInServices } from "./internal/oauth/native-sign-in";
import { type OAuthNativeReadMapping } from "./internal/oauth/native-state";
import { captureOAuthMapping } from "./internal/oauth/state";
import { CurrentSqlCommit, makeSqlCommitExecutor, SqlNativeCommit } from "./internal/sql-commit";
import { sql, SqlExpression } from "./internal/sql-expression";
import type {
  OAuthConnectedMapping,
  OAuthConnectedRevocationMapping,
} from "./internal/sql-oauth-connected-model";
import type {
  OAuthAccountsMapping,
  OAuthSignInMapping,
  OAuthRegistrationIntentMapping,
  OAuthRegistrationMapping,
  OAuthRegistrationAuthority,
} from "./internal/sql-oauth-model";
import { validateSqlStorage } from "./internal/sql-storage-validation";
import { Table } from "./internal/sql-table";
import { requireStandalone } from "./internal/standalone";
import type { StorageTable } from "./internal/storage-tables";
import { withStorageValidation } from "./internal/storage-validation";
export * from "./internal/sql-oauth-model";
export * from "./internal/sql-oauth-connected-model";
export * from "./internal/oauth/native-layers";
export { sql, and, eq } from "./internal/sql-expression";
export { makeAuthenticationAuthorityServices } from "./internal/sql-authority";

export {
  IdentityImport,
  ImportedIdentity,
  IdentityImports,
} from "./internal/oauth/identity-import";

export { oauthIdentityKey as identityKey } from "./internal/oauth/state";

export const table = (definition: StorageTable) =>
  new Table(definition.name, definition.columns, definition.unique, definition.schema);

export const clock = {
  encodeInstant: Schema.encodeSync(Schema.Int),
  decodeInstant: Schema.decodeUnknownSync(Schema.Int),
  engineNowMillis: new SqlExpression((client) =>
    client.onDialectOrElse({
      pg: () => client`cast(extract(epoch from clock_timestamp()) * 1000 as bigint)`,
      orElse: () => client`cast(round((julianday('now') - 2440587.5) * 86400000) as integer)`,
    }),
  ),
  toMillis: (expression: SqlExpression) => expression,
  fromMillis: (expression: SqlExpression) => expression,
};

const acquire = Effect.gen(function* () {
  const client = yield* SqlClient.SqlClient;

  if (
    !client.onDialectOrElse({ pg: () => true, sqlite: () => true, orElse: () => false }) ||
    Predicate.hasProperty(client, "~@effect/sql-d1/D1Client")
  ) {
    yield* reportAuthDiagnostic("persistence-validation", "configuration");

    return yield* PersistenceConfigurationError.make({
      reason: "OAuth persistence requires PostgreSQL or SQLite with interactive transactions",
    });
  }

  return { client, tables: makeNativeSqlTables(client) };
});

const makeLazyServices = Effect.fnUntraced(function* <M, A>(
  original: M,
  make: (
    tables: ReturnType<typeof makeNativeSqlTables>,
    mapping: M,
  ) => Effect.Effect<A, OAuthUnavailable, Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient>,
): Effect.fn.Return<
  Effect.Effect<A, OAuthUnavailable>,
  PersistenceConfigurationError,
  Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
> {
  const { client, tables } = yield* acquire;
  const mapping = captureOAuthMapping(original);

  // Preserve explicit ownership, but never retain the construction transaction's connection.
  const captured = yield* Effect.context<
    Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
  >().pipe(Effect.map(Context.omit(client.transactionService)));

  const executor = yield* makeSqlCommitExecutor(() => OAuthUnavailable.make({}));

  // Cache only validation and service construction; operations acquire their own connection.
  const initialize = yield* Effect.cached(
    validateSqlStorage(mapping).pipe(
      Effect.mapError(() => OAuthUnavailable.make({})),
      Effect.andThen(make(tables, mapping)),
      withStorageValidation,
      Effect.updateContext((current: Context.Context<never>) =>
        Context.merge(
          current.pipe(Context.omit(CurrentSqlCommit, CurrentCommitJournal, SqlNativeCommit)),
          captured,
        ),
      ),
    ),
  );

  // Check ownership before accessing the cache so rejected callers cannot initialize it.
  return executor.read(initialize);
});

const coordinate = Effect.fnUntraced(function* <S, A, E, R, ES, RS>(
  make: Effect.Effect<S, ES, RS>,
  body: (services: S) => Effect.Effect<A, E, R>,
) {
  const { client } = yield* acquire;

  if (yield* hasCommitScope) return yield* OAuthUnavailable.make({});
  yield* requireStandalone(() => OAuthUnavailable.make({}), client.transactionService);
  const executor = yield* makeSqlCommitExecutor(() => OAuthUnavailable.make({}));

  return yield* executor.coordinate(
    Effect.flatMap(make.pipe(Effect.mapError(() => OAuthUnavailable.make({}))), body),
  );
});

export const makeOAuthSignInServices = Effect.fnUntraced(function* <N>(
  mapping: OAuthSignInMapping<Table, Table, Table, Table, Table, N>,
): Effect.fn.Return<
  { readonly oauthSignInPersistence: OAuthSignInPersistence["Service"] },
  OAuthUnavailable | PersistenceConfigurationError,
  Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
> {
  const services = yield* makeLazyServices(mapping, (tables, value) =>
    makeNativeOAuthSignInServices(tables, value as unknown as OAuthNativeReadMapping),
  );

  return {
    oauthSignInPersistence: {
      issue: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthSignInPersistence.issue(input, prepare)),
      consume: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthSignInPersistence.consume(input, prepare)),
      resolve: (input) => Effect.flatMap(services, (s) => s.oauthSignInPersistence.resolve(input)),
      cleanup: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthSignInPersistence.cleanup(input, prepare)),
    },
  };
});

export const coordinateOAuthSignIn = <N, A, E, R>(
  options: { readonly mapping: OAuthSignInMapping<Table, Table, Table, Table, Table, N> },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | OAuthUnavailable | PersistenceConfigurationError,
  Exclude<R, OAuthSignInPersistence> | Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
> =>
  coordinate(makeOAuthSignInServices(options.mapping), (services) =>
    Effect.provideService(body, OAuthSignInPersistence, services.oauthSignInPersistence),
  );

export const makeOAuthAccountsServices = Effect.fnUntraced(function* <N>(
  mapping: OAuthAccountsMapping<Table, Table, Table, Table, Table, N>,
): Effect.fn.Return<
  { readonly oauthAccountsPersistence: OAuthAccountsPersistence["Service"] },
  OAuthUnavailable | PersistenceConfigurationError,
  Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
> {
  const services = yield* makeLazyServices(mapping, (tables, value) =>
    makeNativeOAuthAccountsServices(tables, value as unknown as OAuthNativeAccountsMapping),
  );

  return {
    oauthAccountsPersistence: {
      list: (input) => Effect.flatMap(services, (s) => s.oauthAccountsPersistence.list(input)),
      capture: (input) =>
        Effect.flatMap(services, (s) => s.oauthAccountsPersistence.capture(input)),
      issue: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthAccountsPersistence.issue(input, prepare)),
      consume: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthAccountsPersistence.consume(input, prepare)),
      link: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthAccountsPersistence.link(input, prepare)),
      readCredential: (input) =>
        Effect.flatMap(services, (s) => s.oauthAccountsPersistence.readCredential(input)),
      unlink: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthAccountsPersistence.unlink(input, prepare)),
      cleanup: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthAccountsPersistence.cleanup(input, prepare)),
    },
  };
});

export const coordinateOAuthAccounts = <N, A, E, R>(
  options: { readonly mapping: OAuthAccountsMapping<Table, Table, Table, Table, Table, N> },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | OAuthUnavailable | PersistenceConfigurationError,
  Exclude<R, OAuthAccountsPersistence> | Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
> =>
  coordinate(makeOAuthAccountsServices(options.mapping), (services) =>
    Effect.provideService(body, OAuthAccountsPersistence, services.oauthAccountsPersistence),
  );

export const makeOAuthRegistrationIntentServices = Effect.fnUntraced(function* <N>(
  mapping: OAuthRegistrationIntentMapping<Table, Table, N>,
): Effect.fn.Return<
  { readonly oauthRegistrationIntents: OAuthRegistrationIntents["Service"] },
  OAuthUnavailable | PersistenceConfigurationError,
  Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
> {
  const services = yield* makeLazyServices(mapping, (tables, value) =>
    makeNativeOAuthRegistrationIntentServices(
      tables,
      value as unknown as OAuthNativeRegistrationIntentMapping,
    ),
  );

  return {
    oauthRegistrationIntents: {
      issue: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthRegistrationIntents.issue(input, prepare)),
    },
  };
});

export const coordinateOAuthRegistrationIntents = <N, A, E, R>(
  options: { readonly mapping: OAuthRegistrationIntentMapping<Table, Table, N> },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | OAuthUnavailable | PersistenceConfigurationError,
  Exclude<R, OAuthRegistrationIntents> | Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
> =>
  coordinate(makeOAuthRegistrationIntentServices(options.mapping), (services) =>
    Effect.provideService(body, OAuthRegistrationIntents, services.oauthRegistrationIntents),
  );

export const makeOAuthConnectedServices = Effect.fnUntraced(function* <N>(
  mapping: OAuthConnectedMapping<Table, Table, Table, Table, Table, N, Table>,
): Effect.fn.Return<
  { readonly oauthConnectedPersistence: OAuthConnectedPersistence["Service"] },
  OAuthUnavailable | PersistenceConfigurationError,
  Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
> {
  const services = yield* makeLazyServices(mapping, (tables, value) =>
    makeNativeOAuthConnectedServices(tables, value as unknown as OAuthNativeConnectedMapping),
  );

  return {
    oauthConnectedPersistence: {
      read: (input) => Effect.flatMap(services, (s) => s.oauthConnectedPersistence.read(input)),
      issue: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthConnectedPersistence.issue(input, prepare)),
      consume: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthConnectedPersistence.consume(input, prepare)),
      settle: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthConnectedPersistence.settle(input, prepare)),
      list: (input) => Effect.flatMap(services, (s) => s.oauthConnectedPersistence.list(input)),
      disconnect: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthConnectedPersistence.disconnect(input, prepare)),
      claimRefresh: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthConnectedPersistence.claimRefresh(input, prepare)),
      settleRefresh: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthConnectedPersistence.settleRefresh(input, prepare)),
      cleanup: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthConnectedPersistence.cleanup(input, prepare)),
    },
  };
});

export const coordinateOAuthConnected = <N, A, E, R>(
  options: { readonly mapping: OAuthConnectedMapping<Table, Table, Table, Table, Table, N, Table> },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | OAuthUnavailable | PersistenceConfigurationError,
  Exclude<R, OAuthConnectedPersistence> | Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
> =>
  coordinate(makeOAuthConnectedServices(options.mapping), (services) =>
    Effect.provideService(body, OAuthConnectedPersistence, services.oauthConnectedPersistence),
  );

export const makeOAuthConnectedRevocationServices = Effect.fnUntraced(function* <N>(
  mapping: OAuthConnectedRevocationMapping<Table, Table, Table, N>,
): Effect.fn.Return<
  { readonly oauthConnectedRevocations: OAuthConnectedRevocations["Service"] },
  OAuthUnavailable | PersistenceConfigurationError,
  Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
> {
  const services = yield* makeLazyServices(mapping, (tables, value) =>
    makeNativeOAuthRevocationServices(tables, value as unknown as OAuthNativeRevocationMapping),
  );

  return {
    oauthConnectedRevocations: {
      claim: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthConnectedRevocations.claim(input, prepare)),
      settle: (input, prepare) =>
        Effect.flatMap(services, (s) => s.oauthConnectedRevocations.settle(input, prepare)),
    },
  };
});

export const coordinateOAuthConnectedRevocations = <N, A, E, R>(
  options: { readonly mapping: OAuthConnectedRevocationMapping<Table, Table, Table, N> },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | OAuthUnavailable | PersistenceConfigurationError,
  Exclude<R, OAuthConnectedRevocations> | Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
> =>
  coordinate(makeOAuthConnectedRevocationServices(options.mapping), (services) =>
    Effect.provideService(body, OAuthConnectedRevocations, services.oauthConnectedRevocations),
  );

export const makeOAuthRegistrationServices = Effect.fnUntraced(function* <Registration, N>(
  mapping: OAuthRegistrationMapping<Registration, Table, Table, Table, Table, Table, N>,
): Effect.fn.Return<
  { readonly registrationAuthority: OAuthRegistrationAuthority<Registration> },
  OAuthUnavailable | PersistenceConfigurationError,
  Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
> {
  const services = yield* makeLazyServices(mapping, (tables, value) =>
    makeNativeOAuthRegistrationServices(
      tables,
      value as unknown as OAuthNativeRegistrationMapping<Registration>,
    ),
  );

  return {
    registrationAuthority: {
      authentication: "first-confirmed-registration",
      read: (input) => Effect.flatMap(services, (s) => s.registrationAuthority.read(input)),
      inspect: (input) => Effect.flatMap(services, (s) => s.registrationAuthority.inspect(input)),
      register: (input, prepare) =>
        Effect.flatMap(services, (s) => s.registrationAuthority.register(input, prepare)),
      cleanup: (input, prepare) =>
        Effect.flatMap(services, (s) => s.registrationAuthority.cleanup(input, prepare)),
    },
  };
});

export const coordinateOAuthRegistration = <Id, Registration, N, A, E, R>(
  options: {
    readonly mapping: OAuthRegistrationMapping<
      NoInfer<Registration>,
      Table,
      Table,
      Table,
      Table,
      Table,
      N
    >;
    readonly target: Context.Key<Id, OAuthRegistrationAuthority<Registration>>;
  },
  body: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | OAuthUnavailable | PersistenceConfigurationError,
  Exclude<R, Id> | Crypto.Crypto | LifecycleHooks | SqlClient.SqlClient
> =>
  coordinate(makeOAuthRegistrationServices(options.mapping), (services) =>
    Effect.provideService(body, options.target, services.registrationAuthority),
  );

export const oauthConnectedOwnershipReferences = <N>(
  mapping: OAuthConnectedMapping<Table, Table, Table, Table, Table, N, Table>,
) => ({
  connectedReference: (input: { readonly identityKey: string; readonly subjectId: N }) => {
    const g = mapping.grant;
    const grant = sql`exists(select 1 from ${g.table} where ${g.table.columns[g.identityKey]} = ${input.identityKey} and ${g.table.columns[g.subjectId]} = ${input.subjectId})`;

    if (mapping.revocation.mode === "unsupported") return grant;
    const j = mapping.revocation.job;

    return sql`(${grant}) or exists(select 1 from ${j.table} where ${j.table.columns[j.identityKey]} = ${input.identityKey} and ${j.table.columns[j.subjectId]} = ${input.subjectId})`;
  },
});
