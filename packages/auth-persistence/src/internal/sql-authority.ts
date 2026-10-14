import type { LifecycleHooks } from "@yielded/auth/Hooks";
import { reportAuthDiagnostic } from "@yielded/auth/Persistence";
import { SessionUnavailable, type AuthenticationAuthority } from "@yielded/auth/Sessions";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";

import { PersistenceConfigurationError } from "./configuration";
import type { AuthenticationAuthorityMapping } from "./models/session-model";
import { makeNativeSqlTables } from "./native-sql-table";
import {
  makeNativeAuthenticationAuthorityServices,
  type NativeAuthenticationAuthorityMapping,
} from "./session-native-authority";
import { SqlBatchCommit } from "./sql-commit";
import { SqlExpression, compileSqlExpression } from "./sql-expression";
import type { SqlTableModel } from "./sql-oauth-model";
import { validateSqlStorage } from "./sql-storage-validation";

/** Direct SQL uses the same authority owner as the mapped Drizzle adapters. */
export const makeAuthenticationAuthorityServices = Effect.fnUntraced(function* <Claims, N>(
  mapping: AuthenticationAuthorityMapping<
    Claims,
    SqlTableModel,
    SqlTableModel,
    SqlTableModel,
    N,
    SqlExpression
  >,
): Effect.fn.Return<
  { readonly authenticationAuthority: AuthenticationAuthority["Service"] },
  SessionUnavailable | PersistenceConfigurationError,
  LifecycleHooks | SqlClient.SqlClient
> {
  const sql = yield* SqlClient.SqlClient;

  if (!sql.onDialectOrElse({ pg: () => true, sqlite: () => true, orElse: () => false })) {
    yield* reportAuthDiagnostic("persistence-validation", "configuration");

    return yield* PersistenceConfigurationError.make({
      reason: "Authentication authority requires PostgreSQL or SQLite",
    });
  }
  yield* validateSqlStorage(mapping).pipe(Effect.mapError(() => SessionUnavailable.make({})));

  // Erase mapped native ID callback variance, never decoded authentication data.
  return yield* makeNativeAuthenticationAuthorityServices(makeNativeSqlTables(sql), {
    ...mapping,
    clock: {
      ...mapping.clock,
      toMillis: (value: unknown) =>
        mapping.clock.toMillis(new SqlExpression((client) => compileSqlExpression(client, value))),
      fromMillis: (value: unknown) =>
        mapping.clock.fromMillis(
          new SqlExpression((client) => compileSqlExpression(client, value)),
        ),
    },
  } as unknown as NativeAuthenticationAuthorityMapping<Claims>).pipe(
    Effect.provideService(SqlBatchCommit, undefined),
  );
});
