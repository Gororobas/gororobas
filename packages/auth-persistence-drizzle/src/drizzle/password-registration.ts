import type {
  NativeDatabase,
  PasswordRegistrationAuthority,
} from "@yielded/auth-persistence/Adapter";
import {
  coordinateCommit,
  CurrentCommitJournal,
  hasCommitScope,
  LifecycleHooks,
  HookConfigurationError,
} from "@yielded/auth/Hooks";
import type { LoginIdentifier } from "@yielded/auth/Identity";
import {
  PasswordUnavailable,
  type PasswordReplacement,
  type PasswordRegistrationDecision,
  type PreparePasswordCommit,
} from "@yielded/auth/Password";
import { reportPersistenceFailure } from "@yielded/auth/Persistence";
import { ProofUnavailable } from "@yielded/auth/Proofs";
/* oxlint-disable no-explicit-any -- registration plans bridge consumer-owned Drizzle rows. */
import { and, eq } from "drizzle-orm";
import { Cause, Effect, Schema } from "effect";

import { column, isMappedConstraintConflict, PersistenceMappingError } from "./model";
import {
  type AnyPasswordRegistrationMapping,
  requiredPasswordRegistrationConstraints,
} from "./password-model";
import { CurrentPasswordSql, type PasswordSqlQuery } from "./password-sql";
import { CurrentProofSql, type ProofSqlDatabase } from "./proof-sql";
import { validateDrizzleStorage } from "./storage-validation";

type Mapping<Registration> = AnyPasswordRegistrationMapping<Registration>;
const unavailable = () => PasswordUnavailable.make({});

const translateFailure = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, PasswordUnavailable, R> =>
  reportPersistenceFailure(
    effect,
    (error) =>
      Schema.is(PasswordUnavailable)(error) ||
      Schema.is(ProofUnavailable)(error) ||
      Schema.is(HookConfigurationError)(error),
  ).pipe(Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, () => unavailable()))));

export type { PasswordRegistrationAuthority } from "@yielded/auth-persistence/Adapter";

export interface PasswordRegistrationConfiguration {
  readonly mode: "interactive" | "synchronous";
  readonly locking: boolean;
  readonly standaloneGuard: Effect.Effect<void, PasswordUnavailable>;
  readonly coordinated?: boolean;
  readonly generatedSubjectRows: (query: PasswordSqlQuery) => PasswordSqlQuery;
}

const validConstraints = <Registration>(mapping: Mapping<Registration>) =>
  Object.entries(requiredPasswordRegistrationConstraints).every(
    ([key, value]) =>
      mapping.constraints[key as keyof typeof requiredPasswordRegistrationConstraints] === value,
  );

const selectRows = (query: PasswordSqlQuery, locking: boolean) =>
  locking && typeof query.for === "function" ? query.for("update") : query;

const allocate = <A>(
  mode: PasswordRegistrationConfiguration["mode"],
  asyncValue: Effect.Effect<A, PersistenceMappingError> | undefined,
  syncValue: (() => A) | undefined,
) => {
  if (mode === "synchronous")
    return syncValue === undefined
      ? Effect.fail(unavailable())
      : Effect.try({
          try: syncValue,
          catch: (cause) => new PersistenceMappingError({ operation: "mapping", cause }),
        });
  if (asyncValue !== undefined) return asyncValue;

  return syncValue === undefined
    ? Effect.fail(unavailable())
    : Effect.try({
        try: syncValue,
        catch: (cause) => new PersistenceMappingError({ operation: "mapping", cause }),
      });
};

const registrationRows = Effect.fn("Drizzle.registrationRows")(function* <Registration>(
  mapping: Mapping<Registration>,
  moduleId: string,
  requestId: string,
  locking: boolean,
) {
  const database = yield* CurrentPasswordSql;

  const module = column(mapping.registration.table, mapping.registration.moduleId);
  const request = column(mapping.registration.table, mapping.registration.requestId);

  const query = database
    .select()
    .from(mapping.registration.table)
    .where(and(eq(module, moduleId), eq(request, requestId)))
    .limit(1);

  return yield* selectRows(query, locking);
});

const registerIn = Effect.fn("DrizzlePasswordRegistration.registerIn")(function* <Registration, A>(
  mapping: Mapping<Registration>,
  configuration: PasswordRegistrationConfiguration,
  input: {
    readonly moduleId: string;
    readonly requestId: string;
    readonly identifier: LoginIdentifier;
    readonly registration: Registration;
    readonly replacement: PasswordReplacement;
  },
  allocated: {
    readonly credentialId: string;
    readonly securityRevision: any;
    readonly identifierRevision: any;
    readonly credentialRevision: any;
    readonly verifierVersion: any;
    readonly nativeSubjectId?: unknown;
    readonly recoveryReference?: any;
  },
  prepare: PreparePasswordCommit<PasswordRegistrationDecision, A>,
) {
  const database = yield* CurrentPasswordSql;
  const journal = yield* CurrentCommitJournal;

  const existing = (yield* registrationRows(
    mapping,
    input.moduleId,
    input.requestId,
    configuration.locking,
  ))[0];

  if (existing !== undefined)
    return prepare(yield* mapping.registration.decodeReplay(existing), journal);

  const intent = {
    moduleId: input.moduleId,
    requestId: input.requestId,
    identifier: input.identifier,
    registration: input.registration,
    replacement: input.replacement,
  };

  if (mapping.mode === "pending") {
    if (allocated.recoveryReference === undefined) return yield* unavailable();
    const receipt = prepare({ _tag: "Pending", reference: allocated.recoveryReference }, journal);

    yield* database.insert(mapping.registration.table).values(
      mapping.registration.encodeInsert(intent, {
        state: "pending",
        recoveryReference: allocated.recoveryReference,
      }),
    );

    return receipt;
  }
  let nativeSubjectId = allocated.nativeSubjectId;

  const subjectInsert = database.insert(mapping.subject.table).values(
    mapping.provisioning.encodeSubjectInsert(intent, {
      nativeSubjectId,
      securityRevision: allocated.securityRevision,
    }),
  );

  if (mapping.provisioning.idMode === "generated") {
    const rows = yield* configuration.generatedSubjectRows(subjectInsert);

    nativeSubjectId = yield* mapping.provisioning.decodeGeneratedId(rows);
  } else yield* subjectInsert;
  if (nativeSubjectId === undefined) return yield* unavailable();
  const subjectId = yield* mapping.subjectId.toSubject(nativeSubjectId);
  const receipt = prepare({ _tag: "Created", subjectId }, journal);

  yield* database
    .insert(mapping.identifier.table)
    .values(
      mapping.identifier.encodeInitialInsert(
        input.identifier,
        nativeSubjectId,
        allocated.identifierRevision,
      ),
    );
  yield* database.insert(mapping.credential.table).values(
    mapping.credential.encodeInsert({
      moduleId: input.moduleId,
      subjectId: nativeSubjectId,
      credentialId: allocated.credentialId,
      credentialRevision: allocated.credentialRevision,
      verifierVersion: allocated.verifierVersion,
      replacement: input.replacement,
    }),
  );
  yield* database.insert(mapping.authorityCredential.table).values(
    mapping.authorityCredential.encodeInsert({
      subjectId: nativeSubjectId,
      credentialId: allocated.credentialId,
      revision: allocated.credentialRevision,
    }),
  );
  yield* database.insert(mapping.registration.table).values(
    mapping.registration.encodeInsert(intent, {
      state: "created",
      nativeSubjectId,
    }),
  );

  return receipt;
});

export const makeSqlPasswordRegistrationAuthority = Effect.fn(
  "makeSqlPasswordRegistrationAuthority",
)(function* <Registration>(
  mapping: Mapping<Registration>,
  configuration: PasswordRegistrationConfiguration,
): Effect.fn.Return<
  PasswordRegistrationAuthority<Registration>,
  PasswordUnavailable,
  LifecycleHooks | CurrentPasswordSql | NativeDatabase
> {
  const database = yield* CurrentPasswordSql;

  if (!configuration.coordinated)
    yield* validateDrizzleStorage(mapping).pipe(Effect.mapError(unavailable));
  const hooks = yield* LifecycleHooks;

  return {
    register: (input, prepare) =>
      Effect.gen(function* () {
        if (!validConstraints(mapping)) return yield* unavailable();

        const credentialId = yield* allocate(
          configuration.mode,
          mapping.allocateCredentialId,
          mapping.allocateCredentialIdSync,
        );

        const securityRevision = yield* allocate(
          configuration.mode,
          mapping.allocateRevision,
          mapping.allocateRevisionSync,
        );

        const credentialRevision = yield* allocate(
          configuration.mode,
          mapping.allocateRevision,
          mapping.allocateRevisionSync,
        );

        const identifierRevision = yield* allocate(
          configuration.mode,
          mapping.allocateRevision,
          mapping.allocateRevisionSync,
        );

        const verifierVersion = yield* allocate(
          configuration.mode,
          mapping.allocateRevision,
          mapping.allocateRevisionSync,
        );

        const nativeSubjectId =
          mapping.mode !== "atomic" || mapping.provisioning.idMode === "generated"
            ? undefined
            : yield* allocate(
                configuration.mode,
                mapping.provisioning.allocateSubjectId,
                mapping.provisioning.allocateSubjectIdSync,
              );

        const recoveryReference =
          mapping.mode === "pending"
            ? yield* allocate(
                configuration.mode,
                mapping.allocateRecoveryReference,
                mapping.allocateRecoveryReferenceSync,
              )
            : undefined;

        const run = coordinateCommit(
          () =>
            database.transaction((transaction) =>
              registerIn(
                mapping,
                configuration,
                input,
                {
                  credentialId,
                  securityRevision,
                  identifierRevision,
                  credentialRevision,
                  verifierVersion,
                  ...(nativeSubjectId === undefined ? {} : { nativeSubjectId }),
                  ...(recoveryReference === undefined ? {} : { recoveryReference }),
                },
                prepare,
              ).pipe(
                Effect.provideService(CurrentPasswordSql, transaction),
                Effect.provideService(CurrentProofSql, transaction as unknown as ProofSqlDatabase),
              ),
            ),
          { mode: configuration.mode },
        ).pipe(Effect.map((result) => result.value));

        const guarded =
          configuration.coordinated !== true
            ? Effect.gen(function* () {
                if (yield* hasCommitScope) return yield* unavailable();
                yield* configuration.standaloneGuard;

                return yield* run;
              })
            : run;

        return yield* guarded.pipe(
          Effect.catchCause((cause) => {
            if (
              (cause.reasons.every(Cause.isFailReason) &&
                isMappedConstraintConflict(mapping.isRequestConflict, cause)) ||
              (cause.reasons.every(Cause.isFailReason) &&
                isMappedConstraintConflict(mapping.isIdentifierConflict, cause)) ||
              (cause.reasons.every(Cause.isFailReason) &&
                isMappedConstraintConflict(mapping.isCredentialConflict, cause))
            )
              return coordinateCommit(
                (journal) =>
                  database.transaction((transaction) =>
                    Effect.gen(function* () {
                      const row = (yield* registrationRows(
                        mapping,
                        input.moduleId,
                        input.requestId,
                        configuration.locking,
                      ))[0];

                      const decision =
                        row === undefined
                          ? ({ _tag: "Suppressed" } as const)
                          : yield* mapping.registration.decodeReplay(row);

                      return prepare(decision, journal);
                    }).pipe(
                      Effect.provideService(CurrentPasswordSql, transaction),
                      Effect.provideService(
                        CurrentProofSql,
                        transaction as unknown as ProofSqlDatabase,
                      ),
                    ),
                  ),
                { mode: configuration.mode },
              ).pipe(Effect.map((result) => result.value));

            return Effect.failCause(cause);
          }),
        );
      }).pipe(
        Effect.provideService(CurrentPasswordSql, database),
        Effect.provideService(LifecycleHooks, hooks),
        translateFailure,
      ),
  };
});
