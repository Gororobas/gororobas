import type { LifecycleHooks } from "@yielded/auth/Hooks";
import { AuthenticationClock } from "@yielded/auth/Operations";
import {
  PendingAuthenticationInvalid,
  StaleAuthentication,
  SessionConflict,
  type PendingAuthentication,
  type PendingAuthenticationRecord,
  type SessionUnavailable,
} from "@yielded/auth/Sessions";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as SqlClient from "effect/sql/SqlClient";

import { sqlBatchAssertion } from "./d1-planning";
import { PersistenceMappingError, isMappedConstraintConflict } from "./mapping-error";
import type { PendingAuthenticationMapping } from "./models/session-model";
import type { NativeSqlTables } from "./native-sql-table";
import { prepareNativeSession, type StoredSessionPending } from "./session-native-pending";
import { makeNativeSessionPendingReader } from "./session-native-pending-read";
import {
  normalizeSessionOperation,
  sessionUnavailable,
  sameSessionRevision,
  assessSessionAt,
  invalidSessionState,
} from "./session-native-state";
import { allocateSessionValue } from "./session-policy";
import {
  CurrentSqlCommit,
  makeSqlCommitExecutor,
  SqlBatchCommit,
  registerSqlPostcondition,
  registerSqlBatchPostcondition,
  appendSqlBatchStatement,
} from "./sql-commit";
import type { AnyTableModel } from "./table-model";

export type NativePendingAuthenticationMapping<Claims> = PendingAuthenticationMapping<
  Claims,
  AnyTableModel,
  AnyTableModel,
  AnyTableModel,
  unknown
>;

export const makeNativePendingAuthenticationServices = Effect.fnUntraced(function* <Claims>(
  tables: NativeSqlTables,
  mapping: NativePendingAuthenticationMapping<Claims>,
): Effect.fn.Return<
  { readonly pendingAuthentication: PendingAuthentication<Claims> },
  SessionUnavailable,
  SqlClient.SqlClient | LifecycleHooks | SqlBatchCommit
> {
  const batch = yield* SqlBatchCommit;

  const {
    state,
    pending,
    read: readPending,
  } = yield* normalizeSessionOperation(
    makeNativeSessionPendingReader(tables, mapping, batch !== undefined),
  );

  const executor = yield* makeSqlCommitExecutor(sessionUnavailable);
  const external = yield* Effect.serviceOption(CurrentSqlCommit);

  const { sql, now } = state,
    { p, table } = pending;

  const native = <A, E, R>(
    work: Effect.Effect<A, E, R>,
    mode: "transaction" | "statement" = "transaction",
  ) =>
    (batch === undefined
      ? executor.operation(normalizeSessionOperation(work), mode)
      : executor
          .operationBatch(normalizeSessionOperation(work))
          .pipe(Effect.provideService(SqlBatchCommit, batch))
    ).pipe(Effect.provideService(AuthenticationClock, state.clockPolicy));

  const verifyPayload = Effect.fnUntraced(function* (stored: StoredSessionPending) {
    const record = yield* mapping.login.decode(stored.snapshot);

    if (
      !(
        record.digest === stored.digest &&
        record.version === stored.version &&
        record.evidence.flowId === stored.flowId &&
        record.evidence.bindingDigest === stored.bindingDigest &&
        record.evidence.revision.subjectId === stored.subjectId &&
        DateTime.toEpochMillis(record.expiresAt) === stored.expiresAtMillis &&
        record.attemptLimit === stored.attemptLimit
      )
    )
      return yield* invalidSessionState();

    return record;
  });

  const read = Effect.fnUntraced(function* (
    digest: Parameters<PendingAuthentication<Claims>["read"]>[0]["digest"],
  ) {
    const selected = yield* readPending("Login", digest);

    if (selected === undefined) return undefined;
    const record = yield* verifyPayload(selected.record);

    if (!sameSessionRevision(selected.authority.revision, record.evidence.revision))
      return undefined;

    return { record, requirement: selected.authority.requirement };
  });

  const pendingAuthentication: PendingAuthentication<Claims> = {
    create: (input, _now, project) =>
      native(
        Effect.gen(function* () {
          const current = yield* state.read(input.evidence.revision.subjectId, true);

          if (
            current === undefined ||
            !sameSessionRevision(current.revision, input.evidence.revision)
          )
            return yield* StaleAuthentication.make({});
          yield* assessSessionAt(input.evidence, current.requirement, current.now);
          const expires = DateTime.toEpochMillis(input.expiresAt);

          if (expires <= current.now) return yield* StaleAuthentication.make({});

          const version = yield* allocateSessionValue(
            "interactive",
            mapping.pending.allocateVersion,
            mapping.pending.allocateVersionSync,
          );

          const record: PendingAuthenticationRecord<Claims> = { ...input, version };
          const snapshot = yield* mapping.login.encode(record);

          yield* state.guardPolicy(current);
          const condition = sql`${state.authorityCondition(current.revision, current.native)} and ${now} >= ${current.now} and ${now} < ${expires}`;

          if (batch !== undefined)
            yield* appendSqlBatchStatement(sqlBatchAssertion(sql, condition));
          yield* pending
            .insert(
              {
                moduleId: mapping.moduleId,
                kind: "Login",
                digest: record.digest,
                version,
                flowId: record.evidence.flowId,
                subjectId: current.native,
                bindingDigest: record.evidence.bindingDigest,
                snapshot,
                expiresAt: record.expiresAt,
                attemptLimit: record.attemptLimit,
              },
              condition,
            )
            .pipe(
              Effect.catchCause((cause) =>
                Effect.failCause<SessionConflict | Cause.Cause.Error<typeof cause>>(
                  isMappedConstraintConflict(mapping.isConstraintConflict, cause)
                    ? Cause.map(cause, () => SessionConflict.make({}))
                    : cause,
                ),
              ),
            );
          const final = sql`${condition} and exists(select 1 from ${table.name} where ${pending.predicate(table, "Login", record.digest)} and ${state.exact(table, p.version, version)} and ${state.exact(table, p.snapshot, snapshot)})`;

          if (batch !== undefined)
            yield* registerSqlBatchPostcondition({
              name: "pending-login-issuance",
              statement: sqlBatchAssertion(sql, final),
            });
          else if (Option.isSome(external))
            yield* registerSqlPostcondition({
              name: "pending-login-issuance",
              check: Effect.gen(function* () {
                const rows = yield* sql`select 1 where ${final}`;

                if (!(rows.length === 1)) return yield* invalidSessionState();
              }).pipe(
                Effect.catchCause((cause) =>
                  Effect.failCause(
                    Cause.map(cause, (error) =>
                      PersistenceMappingError.make({ operation: "decode", cause: error }),
                    ),
                  ),
                ),
              ),
            });

          return yield* prepareNativeSession(record, project);
        }),
      ),
    read: ({ digest }) =>
      executor.read(read(digest)).pipe(
        Effect.filterOrFail(
          (result) => !(result === undefined),
          () => PendingAuthenticationInvalid.make({}),
        ),
      ),
    reject: ({ digest }, project) =>
      native(
        Effect.gen(function* () {
          yield* pending.reject("Login", digest);

          return yield* prepareNativeSession({ _tag: "Rejected" } as const, project);
        }),
        "statement",
      ),
  };

  return { pendingAuthentication };
});
