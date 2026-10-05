/* oxlint-disable no-explicit-any -- existing mapped-row bridge; public adapters preserve table, ID, and Effect types. */

import {
  PasskeyCredential,
  PasskeyDescriptor,
  PasskeyRevision,
  PasskeyUserHandle,
  validatePasskeyPolicy,
  snapshotPasskeySync,
} from "@yielded/auth/Passkey";
import type { SubjectId } from "@yielded/auth/Schema";
import { Effect, Schema } from "effect";

import type { QueryOperations } from "../query-operations";
import type { makeTransactionKernel } from "../transaction-kernel";
import { CurrentPasskeyTransaction } from "./state";
import type { makePasskeyStateKernel } from "./state";

export interface SubjectRead {
  readonly nativeId: unknown;
  readonly subjectId: SubjectId;
  readonly securityRevision: typeof PasskeyRevision.Type.securityRevision;
}

export interface CredentialRead {
  readonly credential: PasskeyCredential;
  readonly row: Record<string, unknown>;
}

export const makePasskeyCredentialsKernel = (
  operations: QueryOperations,
  state: Pick<
    ReturnType<typeof makePasskeyStateKernel>,
    | "assertNow"
    | "col"
    | "copiedRow"
    | "credentialKey"
    | "equal"
    | "handleKey"
    | "invariant"
    | "mappedColumns"
    | "observeSemantic"
    | "matchesNativeRow"
    | "semanticCredentialColumns"
    | "unavailable"
  >,
  transactions: Pick<ReturnType<typeof makeTransactionKernel>, "both">,
) => {
  const { asc, inArray, sql } = operations;

  const {
    assertNow,
    col,
    copiedRow,
    credentialKey,
    equal,
    handleKey,
    mappedColumns,
    observeSemantic,
    matchesNativeRow,
    semanticCredentialColumns,
    unavailable,
  } = state;

  const invariant: (value: unknown) => asserts value = state.invariant;
  const { both } = transactions;

  const readSubject = Effect.fn("passkey.readSubject")(function* (
    mapping: any,
    subjectId: SubjectId,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const descriptor = mapping.subject;
    const nativeId = mapping.subjectIds.toNative(subjectId);

    invariant(mapping.subjectIds.toSubject(nativeId) === subjectId);

    const found = yield* owner.read(
      descriptor.table,
      equal(descriptor.table, { [descriptor.id]: nativeId }),
      {
        limit: 1,
        columns: [descriptor.id, descriptor.status, descriptor.securityRevision],
      },
    );

    const row = found.rows[0];

    if (row === undefined || !descriptor.isActiveStatus(row[descriptor.status])) return undefined;
    invariant(mapping.subjectIds.equals(descriptor.decodeId(copiedRow(row)), nativeId));

    const active = sql`exists(select 1 from ${descriptor.table} where ${both(
      owner.exact(descriptor.table, row),
      descriptor.activeCondition,
    )})`;

    if (!(yield* owner.check(active))) return undefined;
    owner.postconditions.push(active);

    // oxlint-disable-next-line no-restricted-properties -- native SQL column values enter through this untyped driver boundary.
    const securityRevision = Schema.decodeUnknownSync(PasskeyRevision.fields.securityRevision)(
      row[descriptor.securityRevision],
    );

    return { nativeId, subjectId, securityRevision };
  });

  const readModule = Effect.fn("passkey.readModule")(function* (mapping: any) {
    const owner = yield* CurrentPasskeyTransaction;
    const descriptor = mapping.module;

    const columns = [
      ...new Set<string>([
        descriptor.moduleId,
        descriptor.status,
        descriptor.policyRevision,
        ...descriptor.policyColumns,
      ]),
    ];

    const found = yield* owner.read(
      descriptor.table,
      equal(descriptor.table, { [descriptor.moduleId]: mapping.moduleId }),
      {
        limit: 1,
        columns,
      },
    );

    const row = found.rows[0];

    if (row === undefined || !descriptor.isActiveStatus(row[descriptor.status])) return undefined;
    invariant(row[descriptor.moduleId] === mapping.moduleId);
    yield* assertNow(
      sql`exists(select 1 from ${descriptor.table} where ${both(
        owner.exact(descriptor.table, row),
        descriptor.activeCondition,
      )})`,
    );

    return yield* validatePasskeyPolicy(descriptor.decodeMethodPolicy(copiedRow(row))).pipe(
      Effect.mapError(unavailable),
    );
  });

  const readPolicyGuards = Effect.fn("passkey.readPolicyGuards")(function* (mapping: any) {
    const owner = yield* CurrentPasskeyTransaction;

    for (const guard of [...(mapping.module.guards ?? [])].sort((a, b) =>
      a.scope < b.scope ? -1 : a.scope > b.scope ? 1 : 0,
    )) {
      const locked = yield* owner.read(guard.table, guard.where(mapping.moduleId), {
        limit: 1,
        columns: guard.columns,
      });

      invariant(locked.rows.length === 1);
      yield* assertNow(guard.condition(mapping.moduleId));
    }
  });

  /** Advisory discovery never locks a tuple before its subject. All fields are
   * reread under the common subject/tuple lock order by readCredential. */
  const discoverSubject = Effect.fn("passkey.discoverSubject")(function* (
    mapping: any,
    rpId: string,
    protocolCredentialId: string,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const descriptor = mapping.credentialOwnership;

    const found = yield* owner.read(
      descriptor.table,
      equal(descriptor.table, {
        [descriptor.credentialKey]: credentialKey(rpId, protocolCredentialId),
      }),
      { lock: false, observe: false, limit: 1, columns: mappedColumns(descriptor) },
    );

    const row = found.rows[0];

    if (row === undefined) return undefined;
    invariant(
      row[descriptor.rpId] === rpId &&
        row[descriptor.protocolCredentialId] === protocolCredentialId,
    );
    if (!descriptor.isOwnedState(row[descriptor.state])) return undefined;
    const native = descriptor.decodeSubjectId(copiedRow(row));
    const subjectId = mapping.subjectIds.toSubject(native);

    invariant(mapping.subjectIds.equals(mapping.subjectIds.toNative(subjectId), native));

    return subjectId as SubjectId;
  });

  const readRevision = Effect.fn("passkey.readRevision")(function* (
    mapping: any,
    subject: SubjectRead,
    ids?: ReadonlyArray<string>,
  ) {
    const owner = yield* CurrentPasskeyTransaction;

    if (ids !== undefined) invariant(ids.length <= 64 && new Set(ids).size === ids.length);
    const descriptor = mapping.authority;

    const where = both(
      equal(descriptor.table, { [descriptor.subjectId]: subject.nativeId }),
      descriptor.activeCondition,
      ids === undefined
        ? undefined
        : ids.length === 0
          ? sql`1 = 0`
          : inArray(col(descriptor.table, descriptor.credentialId), [...ids]),
    );

    const found = yield* owner.read(descriptor.table, where, {
      limit: 64,
      columns: mappedColumns(descriptor),
      orderBy: asc(col(descriptor.table, descriptor.credentialId)),
    });

    const credentials = found.rows.map((row) => {
      invariant(descriptor.isActiveStatus(row[descriptor.status]));

      return {
        credentialId: row[descriptor.credentialId],
        revision: row[descriptor.revision],
      };
    });

    const revision = snapshotPasskeySync(PasskeyRevision, {
      subjectId: subject.subjectId,
      securityRevision: subject.securityRevision,
      credentials,
    });

    invariant(
      new Set(revision.credentials.map((item) => item.credentialId)).size ===
        revision.credentials.length,
    );
    if (
      ids !== undefined &&
      (revision.credentials.length !== ids.length ||
        !ids.every((id) => revision.credentials.some((item) => item.credentialId === id)))
    )
      return undefined;

    return revision;
  });

  const readCredential = Effect.fn("passkey.readCredential")(function* (
    mapping: any,
    subject: SubjectRead,
    rpId: string,
    protocolCredentialId: string,
    ids?: ReadonlyArray<string>,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const ownership = mapping.credentialOwnership;
    const tupleKey = credentialKey(rpId, protocolCredentialId);

    const tuple = (yield* owner.read(
      ownership.table,
      equal(ownership.table, { [ownership.credentialKey]: tupleKey }),
      {
        limit: 1,
        columns: mappedColumns(ownership),
      },
    )).rows[0];

    if (tuple === undefined) return undefined;
    invariant(
      tuple[ownership.rpId] === rpId &&
        tuple[ownership.protocolCredentialId] === protocolCredentialId,
    );
    if (!ownership.isOwnedState(tuple[ownership.state])) return undefined;
    if (!mapping.subjectIds.equals(ownership.decodeSubjectId(copiedRow(tuple)), subject.nativeId))
      return undefined;
    yield* assertNow(
      sql`exists(select 1 from ${ownership.table} where ${both(owner.exact(ownership.table, tuple), ownership.ownedCondition)})`,
    );
    const descriptor = mapping.credential;

    const where = equal(descriptor.table, {
      [descriptor.credentialId]: tuple[ownership.credentialId],
    });

    let row = (yield* owner.read(descriptor.table, where, {
      limit: 1,
      lock: false,
      observe: false,
      columns: mappedColumns(descriptor),
    })).rows[0];

    if (row === undefined) return undefined;
    if (!descriptor.isActiveStatus(row[descriptor.status])) return undefined;
    if (!mapping.subjectIds.equals(descriptor.decodeSubjectId(copiedRow(row)), subject.nativeId))
      return undefined;
    let decoded = descriptor.decode(copiedRow(row));
    const handle = mapping.handleOwnership;
    const expectedHandleKey = handleKey(rpId, decoded.userHandle);

    const handleRow = (yield* owner.read(
      handle.table,
      equal(handle.table, { [handle.handleKey]: expectedHandleKey }),
      {
        limit: 1,
        columns: mappedColumns(handle),
      },
    )).rows[0];

    invariant(
      row[descriptor.credentialKey] === tupleKey && row[descriptor.handleKey] === expectedHandleKey,
    );
    if (handleRow === undefined || !handle.isOwnedState(handleRow[handle.state])) return undefined;
    invariant(
      handleRow[handle.rpId] === rpId && handleRow[handle.userHandle] === decoded.userHandle,
    );
    if (!mapping.subjectIds.equals(handle.decodeSubjectId(copiedRow(handleRow)), subject.nativeId))
      return undefined;
    yield* assertNow(
      sql`exists(select 1 from ${handle.table} where ${both(owner.exact(handle.table, handleRow), handle.ownedCondition)})`,
    );

    const locked = (yield* owner.read(descriptor.table, where, {
      limit: 1,
      observe: false,
      columns: mappedColumns(descriptor),
    })).rows[0];

    if (locked === undefined) return undefined;
    invariant(
      matchesNativeRow(
        descriptor.table,
        locked,
        Object.fromEntries(
          semanticCredentialColumns(descriptor).map((column) => [column, row![column]]),
        ),
      ),
    );
    row = locked;
    decoded = descriptor.decode(copiedRow(row));
    yield* observeSemantic(descriptor, where, row);
    yield* assertNow(
      sql`exists(select 1 from ${descriptor.table} where ${both(
        owner.exact(descriptor.table, {
          [descriptor.credentialId]: row[descriptor.credentialId],
          [descriptor.credentialRevision]: row[descriptor.credentialRevision],
        }),
        descriptor.activeCondition,
      )})`,
    );

    const requested =
      ids === undefined ? undefined : [...new Set([...ids, decoded.credentialId])].sort();

    const revision = yield* readRevision(mapping, subject, requested);

    if (revision === undefined) return undefined;

    const credential = snapshotPasskeySync(PasskeyCredential, {
      ...decoded,
      revision,
      active: true,
    });

    invariant(credential.rpId === rpId && credential.protocolCredentialId === protocolCredentialId);
    invariant(
      credential.credentialId === row[descriptor.credentialId] &&
        credential.credentialId === tuple[ownership.credentialId],
    );
    invariant(
      credential.profile.rpId === rpId &&
        credential.profile.algorithms.includes(credential.algorithm),
    );
    invariant(
      credential.counter === Number(row[descriptor.counter]) &&
        credential.maximumCounter === Number(row[descriptor.maximumCounter]),
    );
    invariant(
      credential.maximumCounter >= credential.counter &&
        (!credential.backupState || credential.backupEligible),
    );
    if (
      !revision.credentials.some(
        (item) =>
          item.credentialId === credential.credentialId &&
          item.revision === row[descriptor.credentialRevision],
      )
    )
      return undefined;

    return { credential, row };
  });

  const lookupCredential = Effect.fn("passkey.lookupCredential")(function* (
    mapping: any,
    rpId: string,
    protocolCredentialId: string,
  ) {
    const subjectId = yield* discoverSubject(mapping, rpId, protocolCredentialId);

    if (subjectId === undefined) return undefined;
    const subject = yield* readSubject(mapping, subjectId);

    if (subject === undefined) return undefined;

    return (yield* readCredential(mapping, subject, rpId, protocolCredentialId))?.credential;
  });

  const captureEnrollmentContext = Effect.fn("passkey.captureEnrollmentContext")(function* (
    mapping: any,
    input: { readonly moduleId: string; readonly rpId: string; readonly subjectId: SubjectId },
  ) {
    const owner = yield* CurrentPasskeyTransaction;

    if (input.moduleId !== mapping.moduleId) return undefined;
    const policy = yield* readModule(mapping);

    if (policy === undefined || !policy.profiles.some((profile) => profile.rpId === input.rpId))
      return undefined;
    const subject = yield* readSubject(mapping.read, input.subjectId);

    if (subject === undefined) return undefined;
    yield* readPolicyGuards(mapping);
    const handle = mapping.read.handleOwnership;

    const handles = yield* owner.read(
      handle.table,
      both(
        equal(handle.table, {
          [handle.rpId]: input.rpId,
          [handle.subjectId]: subject.nativeId,
        }),
        handle.ownedCondition,
      ),
      { limit: 1, columns: mappedColumns(handle) },
    );

    const handleRow = handles.rows[0];
    let userHandle: PasskeyUserHandle | undefined;

    if (handleRow !== undefined) {
      invariant(
        handle.isOwnedState(handleRow[handle.state]) && handleRow[handle.rpId] === input.rpId,
      );
      invariant(
        mapping.read.subjectIds.equals(
          handle.decodeSubjectId(copiedRow(handleRow)),
          subject.nativeId,
        ),
      );
      // oxlint-disable-next-line no-restricted-properties -- native SQL column values enter through this untyped driver boundary.
      userHandle = Schema.decodeUnknownSync(PasskeyUserHandle)(handleRow[handle.userHandle]);
      invariant(handleRow[handle.handleKey] === handleKey(input.rpId, userHandle));
    }
    const credential = mapping.read.credential;

    const found = yield* owner.read(
      credential.table,
      both(
        equal(credential.table, {
          [credential.rpId]: input.rpId,
          [credential.subjectId]: subject.nativeId,
        }),
        credential.activeCondition,
      ),
      {
        limit: 64,
        columns: [
          credential.credentialId,
          credential.rpId,
          credential.protocolCredentialId,
          credential.subjectId,
          credential.credentialRevision,
          credential.status,
        ],
        orderBy: asc(col(credential.table, credential.protocolCredentialId)),
      },
    );

    const credentials = found.rows.map((row) => {
      invariant(
        credential.isActiveStatus(row[credential.status]) && row[credential.rpId] === input.rpId,
      );

      return snapshotPasskeySync(PasskeyDescriptor, {
        type: "public-key",
        id: row[credential.protocolCredentialId],
      });
    });

    invariant(new Set(credentials.map((item) => item.id)).size === credentials.length);
    const revision = yield* readRevision(mapping.read, subject);

    invariant(revision !== undefined);

    return { revision, ...(userHandle === undefined ? {} : { userHandle }), credentials };
  });

  return {
    readSubject,
    readModule,
    readPolicyGuards,
    discoverSubject,
    readRevision,
    readCredential,
    lookupCredential,
    captureEnrollmentContext,
  };
};
