import { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import {
  ExternalIdentityMutation,
  type ExternalIdentity,
  IdentityConflict,
  IdentityUnavailable,
  SubjectProvisioned,
  SubjectProvisioner,
  type SubjectProvisioningInput,
} from "@yielded/auth/Identity";
import { reportPersistenceFailure } from "@yielded/auth/Persistence";
import type { SubjectId } from "@yielded/auth/Schema";
/* oxlint-disable no-explicit-any -- Drizzle generic query types are narrowed at this technology boundary. */
import { and, eq } from "drizzle-orm";
import type { EffectMysql2Database } from "drizzle-orm/effect-mysql2";
import type { AnyMySqlTable, MySqlColumn } from "drizzle-orm/mysql-core";
import { Cause, Effect, Schema } from "effect";

import {
  column,
  isMappedConstraintConflict,
  PersistenceMappingError,
  provisioningFingerprint,
  type ExternalIdentityTables,
  type IdentityTables,
  type SubjectProvisioningTables,
} from "./model";
import { Database as DatabaseService } from "./mysql-database";
import { nativeDatabase } from "./native-database";
import { validateDrizzleStorage } from "./storage-validation";

type RuntimeDatabase = EffectMysql2Database<any>;
const unavailable = () => IdentityUnavailable.make();
const isIdentityFailure = Schema.is(Schema.Union([IdentityConflict, IdentityUnavailable]));

const mapUnavailable = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  reportPersistenceFailure(effect, isIdentityFailure).pipe(
    Effect.catchCause((cause) =>
      Effect.failCause(
        Cause.map(cause, (error) => (isIdentityFailure(error) ? error : unavailable())),
      ),
    ),
  );

export const makeMysqlSubjectProvisioningServices = Effect.fnUntraced(function* <
  Subject extends AnyMySqlTable,
  Identifier extends AnyMySqlTable,
  Request extends AnyMySqlTable,
  NativeId,
>(mapping: SubjectProvisioningTables<Subject, Identifier, Request, NativeId>) {
  const database = yield* DatabaseService;

  yield* validateDrizzleStorage(mapping).pipe(
    Effect.provideServiceEffect(NativeDatabase, nativeDatabase(DatabaseService)),
    Effect.mapError(() => IdentityUnavailable.make()),
  );

  const db = database as RuntimeDatabase;
  const requestTable = mapping.provisioningRequest.table;

  const requestIdColumn = column(
    requestTable,
    mapping.provisioningRequest.requestId,
  ) as MySqlColumn;

  const requestFingerprintColumn = column(
    requestTable,
    mapping.provisioningRequest.fingerprint,
  ) as MySqlColumn;

  const requestSubjectColumn = column(
    requestTable,
    mapping.provisioningRequest.subjectId,
  ) as MySqlColumn;

  const identifierTable = mapping.identifier.table;

  const identifierNamespaceColumn = column(
    identifierTable,
    mapping.identifier.namespace,
  ) as MySqlColumn;

  const identifierValueColumn = column(identifierTable, mapping.identifier.value) as MySqlColumn;

  const findReceipt = Effect.fn("DrizzleMysqlIdentity.findReceipt")(function* (requestId: string) {
    const rows = yield* db
      .select({ fingerprint: requestFingerprintColumn, subjectId: requestSubjectColumn })
      .from(requestTable as any)
      .where(eq(requestIdColumn, requestId))
      .limit(1);

    return rows[0];
  });

  const provision = Effect.fn("DrizzleMysqlIdentity.provision")(function* (
    input: SubjectProvisioningInput,
  ) {
    const fingerprint = provisioningFingerprint(input);
    const existing = yield* findReceipt(input.requestId);

    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) return yield* IdentityConflict.make();
      const subjectId = yield* mapping.subjectId.toSubject(existing.subjectId as NativeId);

      return SubjectProvisioned.make({ subjectId });
    }

    const attempt = db.transaction((tx) =>
      Effect.gen(function* () {
        const allocated =
          mapping.subject.allocateId === undefined
            ? mapping.subject.allocateIdSync?.()
            : yield* mapping.subject.allocateId;

        const insert = tx
          .insert(mapping.subject.table as any)
          .values(mapping.subject.encodeInsert(input, allocated) as any);

        let nativeId = allocated;

        if (nativeId === undefined) {
          if (mapping.subject.decodeGeneratedId === undefined)
            return yield* PersistenceMappingError.make({
              operation: "provisionSubject.generatedId",
              cause: new Error("MySQL generated IDs require decodeGeneratedId"),
            });
          const ids = yield* insert.$returningId();

          nativeId = yield* mapping.subject.decodeGeneratedId(ids as ReadonlyArray<unknown>);
        } else {
          yield* insert;
        }
        if (input.identifier !== undefined)
          yield* tx
            .insert(identifierTable as any)
            .values(
              mapping.identifier.encodeInsert(input.identifier, nativeId, input.verifiedAt) as any,
            );
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
              if (receipt !== undefined && receipt.fingerprint === fingerprint)
                return Effect.succeed(receipt.subjectId as NativeId);
              if (input.identifier === undefined) return IdentityConflict.make();

              return db
                .select({
                  subjectId: column(identifierTable, mapping.identifier.subjectId) as MySqlColumn,
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
  }, mapUnavailable);

  return { subjectProvisioner: SubjectProvisioner.of({ provision }) } as const;
});

export const makeMysqlExternalIdentityServices = Effect.fnUntraced(function* <
  Subject extends AnyMySqlTable,
  External extends AnyMySqlTable,
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
  ) as MySqlColumn;

  const externalIssuerColumn = column(
    externalTable,
    mapping.externalIdentity.issuer,
  ) as MySqlColumn;

  const externalSubjectColumn = column(
    externalTable,
    mapping.externalIdentity.subject,
  ) as MySqlColumn;

  const externalSubjectIdColumn = column(
    externalTable,
    mapping.externalIdentity.subjectId,
  ) as MySqlColumn;

  const subjectIdColumn = column(mapping.subject.table, mapping.subject.id) as MySqlColumn;
  const subjectStatusColumn = column(mapping.subject.table, mapping.subject.status) as MySqlColumn;

  const bind = Effect.fn("DrizzleMysqlIdentity.bindExternalIdentity")(function* (
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
  }, mapUnavailable);

  return { externalIdentityMutation: ExternalIdentityMutation.of({ bind }) } as const;
});

export const makeMysqlIdentityServices = Effect.fnUntraced(function* <
  Subject extends AnyMySqlTable,
  Identifier extends AnyMySqlTable,
  External extends AnyMySqlTable,
  Request extends AnyMySqlTable,
  NativeId,
>(mapping: IdentityTables<Subject, Identifier, External, Request, NativeId>) {
  return {
    ...(yield* makeMysqlSubjectProvisioningServices(mapping)),
    ...(yield* makeMysqlExternalIdentityServices(mapping)),
  };
});
