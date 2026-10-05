import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import {
  ExternalIdentityMutation,
  IdentityConflict,
  IdentityUnavailable,
  SubjectProvisioned,
  type ExternalIdentity,
  SubjectProvisioner,
  type SubjectProvisioningInput,
} from "@yielded/auth/Identity";
import { reportPersistenceFailure } from "@yielded/auth/Persistence";
import type { SubjectId } from "@yielded/auth/Schema";
/* oxlint-disable no-explicit-any -- Drizzle's generic query builders lose the concrete consumer table through a runtime column map. Assertions stay in this adapter. */
import { and, eq } from "drizzle-orm";
import type { EffectPgDatabase as PgDatabase } from "drizzle-orm/effect-postgres";
import { type AnyPgTable, type PgColumn } from "drizzle-orm/pg-core";
import { Cause, Effect, Schema } from "effect";

import {
  column,
  PersistenceMappingError,
  isMappedConstraintConflict,
  provisioningFingerprint,
  type ExternalIdentityTables,
  type IdentityTables,
  type SubjectProvisioningTables,
} from "./model";
import { nativeDatabase } from "./native-database";
import { Database as DatabaseService } from "./pg-database";
import { validateDrizzleStorage } from "./storage-validation";

type RuntimeDatabase = PgDatabase<any>;

const identityUnavailable = () => IdentityUnavailable.make();
const isIdentityFailure = Schema.is(Schema.Union([IdentityConflict, IdentityUnavailable]));

const mapIdentityFailure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  reportPersistenceFailure(effect, isIdentityFailure).pipe(
    Effect.catchCause((cause) =>
      Effect.failCause(
        Cause.map(cause, (error) => (isIdentityFailure(error) ? error : identityUnavailable())),
      ),
    ),
  );

export const makePgSubjectProvisioningServices = Effect.fnUntraced(function* <
  Subject extends AnyPgTable,
  Identifier extends AnyPgTable,
  Request extends AnyPgTable,
  NativeId,
>(mapping: SubjectProvisioningTables<Subject, Identifier, Request, NativeId>) {
  const database = yield* DatabaseService;

  yield* validateDrizzleStorage(mapping).pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
    Effect.mapError(() => IdentityUnavailable.make()),
  );

  const db = database as RuntimeDatabase;
  const requestTable = mapping.provisioningRequest.table;
  const requestIdColumn = column(requestTable, mapping.provisioningRequest.requestId);
  const requestFingerprintColumn = column(requestTable, mapping.provisioningRequest.fingerprint);
  const requestSubjectColumn = column(requestTable, mapping.provisioningRequest.subjectId);
  const identifierTable = mapping.identifier.table;
  const identifierNamespaceColumn = column(identifierTable, mapping.identifier.namespace);
  const identifierValueColumn = column(identifierTable, mapping.identifier.value);

  const findReceipt = Effect.fn("DrizzlePgIdentity.findReceipt")(function* (requestId: string) {
    const rows = yield* db
      .select({
        fingerprint: requestFingerprintColumn as PgColumn,
        subjectId: requestSubjectColumn as PgColumn,
      })
      .from(requestTable as any)
      .where(eq(requestIdColumn, requestId))
      .limit(1);

    return rows[0];
  });

  const provision = Effect.fn("DrizzlePgIdentity.provision")(function* (
    input: SubjectProvisioningInput,
  ) {
    const fingerprint = provisioningFingerprint(input);
    const existing = yield* findReceipt(input.requestId);

    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) return yield* IdentityConflict.make();
      const id = yield* mapping.subjectId.toSubject(existing.subjectId as NativeId);

      return SubjectProvisioned.make({ subjectId: id });
    }

    const attempt = db.transaction((tx) =>
      Effect.gen(function* () {
        const allocated =
          mapping.subject.allocateId === undefined ? undefined : yield* mapping.subject.allocateId;

        const inserted = yield* tx
          .insert(mapping.subject.table as any)
          .values(mapping.subject.encodeInsert(input, allocated) as any)
          .returning({ id: column(mapping.subject.table, mapping.subject.id) as PgColumn });

        const nativeId = (inserted[0]?.id ?? allocated) as NativeId | undefined;

        if (nativeId === undefined) {
          return yield* PersistenceMappingError.make({
            operation: "provisionSubject.generatedId",
            cause: new Error("subject insert did not return its native id"),
          });
        }
        if (input.identifier !== undefined) {
          yield* tx
            .insert(identifierTable as any)
            .values(
              mapping.identifier.encodeInsert(input.identifier, nativeId, input.verifiedAt) as any,
            );
        }
        yield* tx
          .insert(requestTable as any)
          .values(
            mapping.provisioningRequest.encodeInsert(input.requestId, fingerprint, nativeId) as any,
          );

        return nativeId;
      }),
    );

    const nativeId = yield* attempt.pipe(
      Effect.catchCause(
        (
          cause,
        ): Effect.Effect<
          NativeId,
          | Effect.Error<typeof attempt>
          | Effect.Error<ReturnType<typeof findReceipt>>
          | IdentityConflict
        > => {
          if (
            cause.reasons.length === 0 ||
            !cause.reasons.every(
              (reason) =>
                Cause.isFailReason(reason) &&
                isMappedConstraintConflict(mapping.isConstraintConflict, reason.error),
            )
          )
            return Effect.failCause(cause);

          return findReceipt(input.requestId).pipe(
            Effect.flatMap((receipt) => {
              if (receipt !== undefined && receipt.fingerprint === fingerprint) {
                return Effect.succeed(receipt.subjectId as NativeId);
              }
              if (input.identifier === undefined) return IdentityConflict.make();

              return db
                .select({
                  subjectId: column(identifierTable, mapping.identifier.subjectId) as PgColumn,
                })
                .from(identifierTable as any)
                .where(
                  and(
                    eq(identifierNamespaceColumn, input.identifier.namespace),
                    eq(identifierValueColumn, input.identifier.value),
                  ),
                )
                .limit(1)
                .pipe(Effect.flatMap(() => IdentityConflict.make()));
            }),
          );
        },
      ),
    );

    const subjectId = yield* mapping.subjectId.toSubject(nativeId);

    return SubjectProvisioned.make({ subjectId });
  }, mapIdentityFailure);

  return {
    subjectProvisioner: SubjectProvisioner.of({ provision }),
  } as const;
});

export const makePgExternalIdentityServices = Effect.fnUntraced(function* <
  Subject extends AnyPgTable,
  External extends AnyPgTable,
  NativeId,
>(mapping: ExternalIdentityTables<Subject, External, NativeId>) {
  const database = yield* DatabaseService;

  yield* validateDrizzleStorage(mapping).pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
    Effect.mapError(() => IdentityUnavailable.make()),
  );

  const db = database as RuntimeDatabase;
  const externalTable = mapping.externalIdentity.table;

  const externalProviderColumn = column(
    externalTable,
    mapping.externalIdentity.provider,
  ) as PgColumn;

  const externalIssuerColumn = column(externalTable, mapping.externalIdentity.issuer) as PgColumn;
  const externalSubjectColumn = column(externalTable, mapping.externalIdentity.subject) as PgColumn;

  const externalSubjectIdColumn = column(
    externalTable,
    mapping.externalIdentity.subjectId,
  ) as PgColumn;

  const subjectIdColumn = column(mapping.subject.table, mapping.subject.id) as PgColumn;
  const subjectStatusColumn = column(mapping.subject.table, mapping.subject.status) as PgColumn;

  const bind = Effect.fn("DrizzlePgIdentity.bindExternalIdentity")(function* (
    subjectId: SubjectId,
    identity: ExternalIdentity,
  ) {
    const nativeId = yield* mapping.subjectId.toNative(subjectId);

    const decision = yield* db
      .transaction((tx) =>
        Effect.gen(function* () {
          const subjects = yield* tx
            .select({ status: subjectStatusColumn })
            .from(mapping.subject.table as any)
            .where(eq(subjectIdColumn, nativeId))
            .for("update")
            .limit(1);

          if (subjects[0] === undefined || !mapping.subject.isActiveStatus(subjects[0].status))
            return { _tag: "conflict" } as const;

          const links = yield* tx
            .select({ subjectId: externalSubjectIdColumn })
            .from(externalTable as any)
            .where(
              and(
                eq(externalProviderColumn, identity.provider),
                eq(externalIssuerColumn, identity.issuer),
                eq(externalSubjectColumn, identity.subject),
              ),
            )
            .for("update")
            .limit(1);

          if (links[0] !== undefined)
            return mapping.subjectId.equals(links[0].subjectId as NativeId, nativeId)
              ? ({ _tag: "bound" } as const)
              : ({ _tag: "conflict" } as const);
          yield* tx
            .insert(externalTable as any)
            .values(mapping.externalIdentity.encodeInsert(identity, nativeId) as any);

          return { _tag: "bound" } as const;
        }),
      )
      .pipe(
        Effect.catchCause((cause) => {
          if (
            cause.reasons.length === 0 ||
            !cause.reasons.every(
              (reason) =>
                Cause.isFailReason(reason) &&
                isMappedConstraintConflict(mapping.isConstraintConflict, reason.error),
            )
          )
            return Effect.failCause(cause);

          return db
            .select({ subjectId: externalSubjectIdColumn })
            .from(externalTable as any)
            .where(
              and(
                eq(externalProviderColumn, identity.provider),
                eq(externalIssuerColumn, identity.issuer),
                eq(externalSubjectColumn, identity.subject),
              ),
            )
            .limit(1)
            .pipe(
              Effect.map((rows) =>
                rows[0] !== undefined &&
                mapping.subjectId.equals(rows[0].subjectId as NativeId, nativeId)
                  ? ({ _tag: "bound" } as const)
                  : ({ _tag: "conflict" } as const),
              ),
            );
        }),
      );

    if (decision._tag === "conflict") return yield* IdentityConflict.make();
  }, mapIdentityFailure);

  return { externalIdentityMutation: ExternalIdentityMutation.of({ bind }) } as const;
});

export const makePgIdentityServices = Effect.fnUntraced(function* <
  Subject extends AnyPgTable,
  Identifier extends AnyPgTable,
  External extends AnyPgTable,
  Request extends AnyPgTable,
  NativeId,
>(mapping: IdentityTables<Subject, Identifier, External, Request, NativeId>) {
  return {
    ...(yield* makePgSubjectProvisioningServices(mapping)),
    ...(yield* makePgExternalIdentityServices(mapping)),
  };
});
