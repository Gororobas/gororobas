import type { LifecycleHooks } from "@yielded/auth/Hooks";
import { PasswordUnavailable } from "@yielded/auth/Password";
import { SecurityRevision } from "@yielded/auth/Sessions";
import { type Context, Crypto, Effect, Schema, Option, Cause } from "effect";
import { SqlClient } from "effect/sql/SqlClient";

import { PersistenceConfigurationError, type SubjectProvisioning } from "./configuration";
import { randomId } from "./crypto";
import type { AnyPasswordPersistenceMapping } from "./models/password-model";
import type { NativeSqlTables } from "./native-sql-table";
import {
  makeNativePasswordRegistrationStore,
  PasswordIdentifierTaken,
} from "./password-registration-native";
import type { PasswordRegistrationAuthority } from "./registration-contract";
import { makeSqlCommitExecutor, CurrentSqlCommit, SqlBatchCommit } from "./sql-commit";

const SubjectValues = Schema.Record(Schema.String, Schema.Unknown);

/** Application provisioning and the unverified identifier/password binding share
 * one physical owner. Identifier uniqueness arbitrates registration; correlation
 * request IDs never become a retained credential-issuance receipt. */
export const makeRegistrationAuthority = Effect.fnUntraced(function* <R>(
  tables: NativeSqlTables,
  mapping: AnyPasswordPersistenceMapping,
  provisioning: Context.Key<R, object>,
  strategy: string,
): Effect.fn.Return<
  PasswordRegistrationAuthority<unknown>,
  PersistenceConfigurationError,
  LifecycleHooks | SqlClient | Crypto.Crypto | SqlBatchCommit | R
> {
  const sql = (yield* SqlClient).withoutTransforms();
  const crypto = yield* Crypto.Crypto;
  const executor = yield* makeSqlCommitExecutor(() => PasswordUnavailable.make({}));
  const parent = yield* Effect.serviceOption(CurrentSqlCommit);
  const batch = yield* SqlBatchCommit;
  const store = yield* makeNativePasswordRegistrationStore(tables, mapping, batch !== undefined);
  // The strategy has already decoded its registration Schema. Only its callback
  // signature is erased by the heterogeneous strategy service map.
  const creators = (yield* provisioning) as Readonly<Record<string, SubjectProvisioning<unknown>>>;
  const createSubject = creators[strategy];

  if (createSubject === undefined)
    return yield* PersistenceConfigurationError.make({
      reason: `Missing subject provisioning for ${strategy}`,
    });
  if (batch !== undefined && typeof createSubject === "function")
    return yield* PersistenceConfigurationError.make({
      reason: `D1 subject provisioning for ${strategy} requires { values }; return the new subject row instead of inserting it`,
    });
  const s = mapping.subject;
  const subject = tables(s.table);
  const lock = sql.onDialectOrElse({ sqlite: () => sql``, orElse: () => sql`for update` });

  const run = <A, E, R2>(work: Effect.Effect<A, E, R2>, suppressed: Effect.Effect<A, E, R2>) =>
    batch !== undefined
      ? executor.batch(work).pipe(Effect.provideService(SqlBatchCommit, batch))
      : Option.isSome(parent)
        ? executor.run(work)
        : executor
            .operation(
              work.pipe(
                Effect.mapError((error) =>
                  error instanceof PasswordIdentifierTaken ? error : PasswordUnavailable.make({}),
                ),
              ),
            )
            .pipe(
              Effect.catchCause((cause) =>
                cause.reasons.length > 0 &&
                cause.reasons.every(
                  (reason) =>
                    Cause.isFailReason(reason) && reason.error instanceof PasswordIdentifierTaken,
                )
                  ? executor.run(suppressed, "statement")
                  : Effect.failCause(cause),
              ),
              Effect.mapError(() => PasswordUnavailable.make({})),
            );

  return {
    register: (input, project) =>
      executor.read(store.available(input.identifier)).pipe(
        Effect.flatMap((existing) =>
          existing.length !== 0
            ? executor.run(store.prepare({ _tag: "Suppressed" }, project), "statement")
            : run(
                Effect.gen(function* () {
                  const provisioningInput = {
                    requestId: input.requestId,
                    identifier: input.identifier,
                    registration: input.registration,
                  };

                  const row = yield* Effect.gen(function* () {
                    if (typeof createSubject !== "function")
                      return yield* createSubject
                        .values(provisioningInput)
                        .pipe(Effect.flatMap(Schema.decodeEffect(SubjectValues)));
                    const subjectId = yield* createSubject(provisioningInput);
                    const nativeId = yield* mapping.subjectId.toNative(subjectId);

                    const rows =
                      yield* sql`select ${subject.fields("registration_subject_")} from ${subject.name} where ${subject.column(s.id)} = ${subject.value(s.id, nativeId)} limit 2 ${lock}`;

                    if (rows.length !== 1) return yield* PasswordUnavailable.make({});

                    return subject.decode(rows[0]!, "registration_subject_");
                  });

                  if (!s.isActiveStatus(row[s.status])) return yield* PasswordUnavailable.make({});
                  const subjectId = yield* mapping.subjectId.toSubject(row[s.id]);

                  const securityRevision = yield* Schema.decodeUnknownEffect(SecurityRevision)(
                    row[s.securityRevision],
                  );

                  if (typeof createSubject !== "function")
                    yield* store.stage(sql`${subject.insert(row)}`);

                  const identifierRevision = SecurityRevision.make(yield* randomId);
                  const credentialId = yield* randomId;
                  const credentialRevision = SecurityRevision.make(yield* randomId);
                  const verifierVersion = SecurityRevision.make(yield* randomId);

                  yield* store.bind({
                    ...input,
                    subjectId,
                    securityRevision,
                    identifierRevision,
                    credentialId,
                    credentialRevision,
                    verifierVersion,
                  });

                  return yield* store.prepare({ _tag: "Created", subjectId }, project);
                }).pipe(Effect.provideService(Crypto.Crypto, crypto)),
                store.prepare({ _tag: "Suppressed" }, project),
              ),
        ),
      ),
  };
});
