/* oxlint-disable no-explicit-any -- existing mapped-row bridge; public adapters preserve table, ID, and Effect types. */

// oxlint-disable-next-line import/extensions -- Noble exposes explicit .js subpaths.
import { sha256 } from "@noble/hashes/sha2.js";
import {
  type PasskeyActionAuthorization,
  type PasskeyCeremony,
  PasskeyBegin,
  PasskeyCredential,
  PasskeyCredentialSummary,
  PasskeyDescriptor,
  PasskeyLabel,
  PasskeyModuleId,
  PasskeyProfile,
  PasskeyRequirement,
  PasskeyRevision,
  PasskeyUserHandle,
  PasskeyManagementPolicy,
  snapshotPasskeySync,
} from "@yielded/auth/Passkey";
import { TokenDigest, type SubjectId } from "@yielded/auth/Schema";
import { SessionInvalidationWindow } from "@yielded/auth/Sessions";
import { DateTime, Effect, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import type { PersistenceMappingError } from "../mapping-error";
import type { QueryOperations } from "../query-operations";
import type { makeTransactionKernel } from "../transaction-kernel";
import { CurrentPasskeyTransaction } from "./state";
import type { makePasskeyStateKernel } from "./state";

export interface WriteSubject {
  readonly subjectId: SubjectId;
  readonly nativeId: any;
  readonly row: Record<string, any>;
  readonly revision: typeof PasskeyRevision.Type;
}

export const makePasskeyWriteStateKernel = (
  operations: QueryOperations,
  state: Pick<
    ReturnType<typeof makePasskeyStateKernel>,
    | "col"
    | "copiedRow"
    | "credentialKey"
    | "equal"
    | "handleKey"
    | "invariant"
    | "mappedColumns"
    | "sameCredential"
    | "sameRevision"
    | "subjectScope"
  >,
  transactions: Pick<ReturnType<typeof makeTransactionKernel>, "both">,
) => {
  const { sql } = operations;

  const {
    col,
    copiedRow,
    credentialKey,
    equal,
    handleKey,
    mappedColumns,
    sameCredential,
    sameRevision,
    subjectScope,
  } = state;

  const invariant: (value: unknown) => asserts value = state.invariant;
  const { both } = transactions;

  const jsonStorage = <S extends Schema.Codec<unknown, unknown, never, never>>(schema: S) => {
    const codec = Schema.fromJsonString(Schema.toCodecJson(Schema.toType(schema)));

    return {
      encode: (value: S["Type"]) => Schema.encodeSync(codec)(snapshotPasskeySync(schema, value)),
      decode: (text: unknown): S["Type"] => {
        // oxlint-disable-next-line no-restricted-properties -- persisted private JSON enters through its schema.
        return Schema.decodeUnknownSync(codec)(text);
      },
    };
  };

  const digest = <S extends Schema.Codec<unknown, unknown, never, never>>(
    schema: S,
    value: S["Type"],
  ) =>
    TokenDigest.make(
      Base64Url.encode(sha256(new TextEncoder().encode(jsonStorage(schema).encode(value)))),
    );

  const currentSubject = Effect.fn("passkey.currentWriteSubject")(function* (
    mapping: any,
    subjectId: SubjectId,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const read = mapping.read;
    const table = read.subject;
    const nativeId = read.subjectIds.toNative(subjectId);

    invariant(read.subjectIds.toSubject(nativeId) === subjectId);

    const row = (yield* owner.read(table.table, equal(table.table, { [table.id]: nativeId }), {
      limit: 1,
      columns: [
        ...new Set<string>([
          table.id,
          table.status,
          table.securityRevision,
          ...mapping.write.policy.subjectColumns,
        ]),
      ],
    })).rows[0];

    if (row === undefined || !table.isActiveStatus(row[table.status])) return undefined;
    invariant(read.subjectIds.equals(table.decodeId(copiedRow(row)), nativeId));
    const active = sql`exists(select 1 from ${table.table} where ${both(equal(table.table, { [table.id]: nativeId }), table.activeCondition)})`;

    if (!(yield* owner.check(active))) return undefined;
    owner.postconditions.push(active);
    const factor = read.authority;

    const factors = (yield* owner.read(
      factor.table,
      both(equal(factor.table, { [factor.subjectId]: nativeId }), factor.activeCondition),
      {
        limit: 64,
        columns: mappedColumns(factor),
        orderBy: col(factor.table, factor.credentialId),
      },
    )).rows;

    const revision = snapshotPasskeySync(PasskeyRevision, {
      subjectId,
      securityRevision: row[table.securityRevision],
      credentials: factors.map((value) => ({
        credentialId: value[factor.credentialId],
        revision: value[factor.revision],
      })),
    });

    invariant(
      new Set(revision.credentials.map((item) => item.credentialId)).size ===
        revision.credentials.length,
    );

    return { subjectId, nativeId, row, revision };
  });

  const credentialRows = Effect.fn("passkey.writeCredentialRows")(function* (
    mapping: any,
    subject: WriteSubject,
    rpId?: string,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const table = mapping.read.credential;

    return (yield* owner.read(
      table.table,
      both(
        equal(table.table, { [table.subjectId]: subject.nativeId }),
        table.activeCondition,
        rpId === undefined ? undefined : equal(table.table, { [table.rpId]: rpId }),
      ),
      { limit: 64, orderBy: col(table.table, table.credentialId) },
    )).rows;
  });

  const summary = (mapping: any, row: any) => {
    const table = mapping.read.credential;
    const write = mapping.write.credential;
    const decoded = table.decode(copiedRow(row));

    return snapshotPasskeySync(PasskeyCredentialSummary, {
      credentialId: decoded.credentialId,
      name: row[write.name],
      primarySignIn: decoded.primarySignIn,
      createdAtMillis: mapping.clock.decodeInstant(row[write.createdAt]),
      ...(row[mapping.telemetry.lastUsedAt] === null ||
      row[mapping.telemetry.lastUsedAt] === undefined
        ? {}
        : { lastUsedAtMillis: mapping.clock.decodeInstant(row[mapping.telemetry.lastUsedAt]) }),
    });
  };

  const ownedCredential = Effect.fn("passkey.ownedWriteCredential")(function* (
    mapping: any,
    subject: WriteSubject,
    row: any,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const read = mapping.read;
    const table = read.credential;

    const decoded = snapshotPasskeySync(PasskeyCredential, {
      ...table.decode(copiedRow(row)),
      revision: subject.revision,
      active: true,
    });

    invariant(
      decoded.credentialId === row[table.credentialId] &&
        decoded.profile.rpId === decoded.rpId &&
        read.subjectIds.equals(table.decodeSubjectId(copiedRow(row)), subject.nativeId),
    );
    const ownership = read.credentialOwnership;
    const key = credentialKey(decoded.rpId, decoded.protocolCredentialId);

    const tuple = (yield* owner.read(
      ownership.table,
      equal(ownership.table, { [ownership.credentialKey]: key }),
      { limit: 1, columns: mappedColumns(ownership) },
    )).rows[0];

    if (
      tuple === undefined ||
      !ownership.isOwnedState(tuple[ownership.state]) ||
      !read.subjectIds.equals(ownership.decodeSubjectId(copiedRow(tuple)), subject.nativeId)
    )
      return undefined;
    invariant(
      tuple[ownership.rpId] === decoded.rpId &&
        tuple[ownership.protocolCredentialId] === decoded.protocolCredentialId &&
        tuple[ownership.credentialId] === decoded.credentialId &&
        row[table.credentialKey] === key,
    );
    const handle = read.handleOwnership;
    const hashedHandle = handleKey(decoded.rpId, decoded.userHandle);

    const held = (yield* owner.read(
      handle.table,
      equal(handle.table, { [handle.handleKey]: hashedHandle }),
      { limit: 1, columns: mappedColumns(handle) },
    )).rows[0];

    if (
      held === undefined ||
      !handle.isOwnedState(held[handle.state]) ||
      !read.subjectIds.equals(handle.decodeSubjectId(copiedRow(held)), subject.nativeId)
    )
      return undefined;
    invariant(
      held[handle.rpId] === decoded.rpId &&
        held[handle.userHandle] === decoded.userHandle &&
        row[table.handleKey] === hashedHandle,
    );
    invariant(
      subject.revision.credentials.some(
        (item) =>
          item.credentialId === decoded.credentialId &&
          item.revision === row[table.credentialRevision],
      ),
    );

    return decoded;
  });

  const managementPolicy = (mapping: any, subject: WriteSubject) =>
    snapshotPasskeySync(
      PasskeyManagementPolicy,
      mapping.write.policy.management(copiedRow(subject.row)),
    );

  const metadataAllowed = Effect.fn("passkey.metadataAllowed")(function* (
    mapping: any,
    subject: WriteSubject,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const condition = mapping.write.policy.metadata(subject.nativeId);
    const allowed = yield* owner.check(condition);

    if (allowed) owner.postconditions.push(condition);

    return allowed;
  });

  const enrollmentDigest = (ceremony: PasskeyCeremony) => {
    invariant(ceremony.context._tag === "Enrollment");
    const context = ceremony.context;

    return digest(
      Schema.Tuple([
        PasskeyModuleId,
        Schema.Literal("enrollment"),
        Schema.Struct({ ...PasskeyBegin.fields, name: PasskeyLabel }),
        PasskeyProfile,
        PasskeyRevision,
        PasskeyUserHandle,
        Schema.Array(PasskeyDescriptor),
      ]),
      [
        ceremony.moduleId,
        "enrollment",
        {
          flowId: ceremony.flowId,
          commandId: ceremony.commandId,
          profileId: ceremony.profile.profileId,
          name: context.name,
        },
        ceremony.profile,
        context.revision,
        context.userHandle,
        ceremony.allowedCredentials,
      ],
    );
  };

  const removeDigest = (moduleId: string, commandId: string, credential: PasskeyCredential) =>
    digest(
      Schema.Tuple([
        PasskeyModuleId,
        Schema.Literal("remove"),
        PasskeyBegin.fields.commandId,
        PasskeyCredential,
      ]),
      [
        PasskeyModuleId.make(moduleId),
        "remove",
        PasskeyBegin.fields.commandId.make(commandId),
        credential,
      ],
    );

  const authorizeAction = Effect.fn("passkey.authorizeWriteAction")(function* (
    mapping: any,
    subject: WriteSubject,
    authorization: PasskeyActionAuthorization,
    expected: {
      readonly action: PasskeyActionAuthorization["challenge"]["action"];
      readonly commandId: string;
      readonly flowId: string;
      readonly bindingDigest: string;
      readonly revision: typeof PasskeyRevision.Type;
    },
    policy: PasskeyManagementPolicy,
    original?: typeof PasskeyRequirement.Type,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const { challenge, evidence } = authorization;

    if (
      challenge.moduleId !== mapping.moduleId ||
      challenge.action !== expected.action ||
      challenge.commandId !== expected.commandId ||
      challenge.flowId !== expected.flowId ||
      challenge.bindingDigest !== expected.bindingDigest ||
      evidence.flowId !== expected.flowId ||
      evidence.bindingDigest !== expected.bindingDigest ||
      !sameRevision(challenge.revision, expected.revision) ||
      subject.revision.subjectId !== expected.revision.subjectId ||
      subject.revision.securityRevision !== expected.revision.securityRevision ||
      evidence.revision.subjectId !== subject.subjectId ||
      evidence.revision.securityRevision !== subject.revision.securityRevision
    )
      return false;
    for (const revision of [expected.revision, evidence.revision])
      if (
        revision.credentials.some(
          (item) =>
            !subject.revision.credentials.some(
              (current) =>
                current.credentialId === item.credentialId && current.revision === item.revision,
            ),
        )
      )
        return false;
    const now = yield* owner.now(mapping.clock);

    if (
      evidence.proofs.some(
        (proof) =>
          DateTime.toEpochMillis(proof.verifiedAt) > now ||
          !evidence.revision.credentials.some((item) => item.credentialId === proof.credentialId),
      )
    )
      return false;

    const currentRequirement: Effect.Effect<
      typeof PasskeyRequirement.Type,
      PersistenceMappingError
    > = mapping.write.policy.requirement(copiedRow(subject.row), expected.action);

    const current = snapshotPasskeySync(PasskeyRequirement, yield* currentRequirement);

    for (const requirement of [
      authorization.requirement,
      current,
      ...(original === undefined ? [] : [original]),
    ]) {
      const age = Math.min(policy.maximumEvidenceAgeMillis, requirement.maximumAgeMillis);

      const fresh = evidence.proofs.filter(
        (proof) => now - DateTime.toEpochMillis(proof.verifiedAt) < age,
      );

      const factors = new Set(fresh.flatMap((proof) => proof.factors));

      if (
        !requirement.alternatives.some(
          (alternative) =>
            alternative.factors.every((factor) => factors.has(factor)) &&
            new Set(fresh.map((proof) => proof.credentialId)).size >=
              alternative.minimumCredentials &&
            fresh.some(
              (proof) =>
                (!alternative.userVerified || proof.userVerified) &&
                (!alternative.phishingResistant || proof.phishingResistant),
            ),
        )
      )
        return false;
      owner.postconditions.push(
        both(
          sql`${mapping.clock.engineNowMillis} >= ${now}`,
          ...fresh.map(
            (proof) =>
              sql`${mapping.clock.engineNowMillis} < ${DateTime.toEpochMillis(proof.verifiedAt) + age}`,
          ),
        ),
      );
    }
    const condition = mapping.write.policy.action(subject.nativeId, authorization);

    if (!(yield* owner.check(condition))) return false;
    owner.postconditions.push(condition);

    return true;
  });

  const invalidationMatches = (
    mapping: any,
    supplied: SessionInvalidationWindow,
    policy: PasskeyManagementPolicy,
  ) =>
    jsonStorage(SessionInvalidationWindow).encode(supplied) ===
      jsonStorage(SessionInvalidationWindow).encode(mapping.invalidation.window) &&
    (!policy.requireImmediateInvalidation || supplied.existingSessions === "immediate");

  const invalidate = Effect.fn("passkey.invalidateCredentialChange")(function* (
    mapping: any,
    subject: WriteSubject,
    invalidation: SessionInvalidationWindow,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const table = mapping.read.subject;
    const revision = PasskeyRevision.fields.securityRevision.make(owner.marker);

    yield* owner.update(
      table.table,
      { [table.id]: subject.nativeId },
      { [table.securityRevision]: revision },
    );

    const input = {
      subjectId: subject.nativeId,
      previousRevision: subject.revision.securityRevision,
      securityRevision: revision,
      invalidation,
    };

    for (const mutation of mapping.invalidation.mutations) {
      yield* owner.write(
        owner.database
          .update(mutation.table)
          .set(mutation.values(input))
          .where(mutation.where(input)),
      );
      owner.postconditions.push(mutation.postcondition(input));
    }
    owner.postconditions.push(mapping.invalidation.postcondition(input));
    const flow = mapping.flow;

    const where = both(
      equal(flow.table, { [flow.subjectScope]: subjectScope(subject.subjectId) }),
      sql`${col(flow.table, flow.state)} in (${flow.states.Pending}, ${flow.states.Claimed})`,
    );

    yield* owner.write(
      owner.database
        .update(flow.table)
        .set({ [flow.state]: flow.states.Rejected, [flow.version]: owner.marker })
        .where(where),
    );
    for (const observation of owner.observations)
      if (observation.table === flow.table)
        observation.rows = observation.rows.map((row) =>
          row[flow.subjectScope] === subjectScope(subject.subjectId) &&
          [flow.states.Pending, flow.states.Claimed].includes(row[flow.state])
            ? { ...row, [flow.state]: flow.states.Rejected, [flow.version]: owner.marker }
            : row,
        );
    owner.postconditions.push(sql`not exists(select 1 from ${flow.table} where ${where})`);

    return revision;
  });

  const validRegistration = (
    ceremony: PasskeyCeremony,
    verified: {
      readonly algorithm: number;
      readonly userVerified: boolean;
      readonly backupEligible: boolean;
      readonly backupState: boolean;
      readonly protocolCredentialId: string;
    },
  ) =>
    ceremony.profile.algorithms.some((algorithm) => algorithm === verified.algorithm) &&
    (ceremony.profile.userVerification !== "required" || verified.userVerified) &&
    (!verified.backupState || verified.backupEligible) &&
    !ceremony.allowedCredentials.some((item) => item.id === verified.protocolCredentialId);

  const insertCredential = Effect.fn("passkey.insertCredential")(function* (
    mapping: any,
    subject: WriteSubject,
    ceremony: PasskeyCeremony,
    verified: any,
    now: number,
  ) {
    const owner = yield* CurrentPasskeyTransaction;

    invariant(ceremony.context._tag === "Enrollment" || ceremony.context._tag === "Registration");
    const read = mapping.read;
    const write = mapping.write;
    const id = PasskeyCredential.fields.credentialId.make(owner.marker);

    const credential = snapshotPasskeySync(PasskeyCredential, {
      credentialId: id,
      rpId: ceremony.profile.rpId,
      protocolCredentialId: verified.protocolCredentialId,
      userHandle: ceremony.context.userHandle,
      publicKey: verified.publicKey,
      algorithm: verified.algorithm,
      profile: ceremony.profile,
      revision: {
        ...subject.revision,
        credentials: [
          ...subject.revision.credentials,
          {
            credentialId: id,
            revision: PasskeyRevision.fields.securityRevision.make(owner.marker),
          },
        ],
      },
      active: true,
      primarySignIn: ceremony.profile.primarySignIn && verified.userVerified,
      enrollmentUserVerified: verified.userVerified,
      backupEligible: verified.backupEligible,
      backupState: verified.backupState,
      counter: verified.counter,
      maximumCounter: verified.counter,
    });

    const safe = snapshotPasskeySync(PasskeyCredentialSummary, {
      credentialId: id,
      name: ceremony.context.name,
      primarySignIn: credential.primarySignIn,
      createdAtMillis: now,
    });

    const input = { subjectId: subject.nativeId, credential, summary: safe, marker: owner.marker };
    const tupleKey = credentialKey(credential.rpId, credential.protocolCredentialId);
    const hashedHandle = handleKey(credential.rpId, credential.userHandle);
    const tuple = read.credentialOwnership;

    const absent = yield* owner.read(
      tuple.table,
      equal(tuple.table, { [tuple.credentialKey]: tupleKey }),
      { limit: 1 },
    );

    invariant(absent.rows.length === 0);

    const inserted = yield* owner.insert(
      tuple.table,
      {
        ...write.credentialOwnership.encodeInsert(input),
        [tuple.credentialKey]: tupleKey,
        [tuple.rpId]: credential.rpId,
        [tuple.protocolCredentialId]: credential.protocolCredentialId,
        [tuple.subjectId]: subject.nativeId,
        [tuple.credentialId]: id,
        [tuple.state]: write.credentialOwnership.ownedState,
        [tuple.version]: owner.marker,
        [tuple.reservationId]: null,
      },
      { [tuple.credentialKey]: tupleKey },
    );

    absent.rows = inserted.rows;
    const table = read.credential;

    const values = {
      ...write.credential.encodeInsert(input),
      [table.credentialId]: id,
      [table.subjectId]: subject.nativeId,
      [table.rpId]: credential.rpId,
      [table.protocolCredentialId]: credential.protocolCredentialId,
      [table.credentialKey]: tupleKey,
      [table.handleKey]: hashedHandle,
      [table.userHandle]: credential.userHandle,
      [table.algorithm]: credential.algorithm,
      [table.credentialRevision]: owner.marker,
      [table.status]: write.credential.activeStatus,
      [table.primarySignIn]: write.credential.encodePrimarySignIn(credential.primarySignIn),
      [table.enrollmentUserVerified]: write.credential.encodeEnrollmentUserVerified(
        credential.enrollmentUserVerified,
      ),
      [table.backupEligible]: write.credential.encodeBackupEligible(credential.backupEligible),
      [table.backupState]: mapping.telemetry.encodeBackupState(credential.backupState),
      [table.counter]: credential.counter,
      [table.maximumCounter]: credential.maximumCounter,
      [write.credential.name]: safe.name,
      [write.credential.createdAt]: mapping.clock.encodeInstant(now),
      [mapping.telemetry.lastUsedAt]: null,
    };

    yield* owner.insert(table.table, values, { [table.credentialId]: id });
    for (const observation of owner.observations)
      if (
        observation.table === table.table &&
        observation.rows !== inserted.rows &&
        !observation.rows.some((row) => row[table.credentialId] === id)
      )
        observation.rows = [...observation.rows, values];
    const factor = read.authority;

    const factorValues = {
      ...write.authority.encodeInsert(input),
      [factor.subjectId]: subject.nativeId,
      [factor.credentialId]: id,
      [factor.revision]: owner.marker,
      [factor.status]: write.authority.activeStatus,
    };

    yield* owner.insert(factor.table, factorValues, {
      [factor.subjectId]: subject.nativeId,
      [factor.credentialId]: id,
    });
    for (const observation of owner.observations)
      if (
        observation.table === factor.table &&
        !observation.rows.some((row) => row[factor.credentialId] === id)
      )
        observation.rows = [...observation.rows, factorValues];

    const decoded = snapshotPasskeySync(PasskeyCredential, {
      ...table.decode(copiedRow(values)),
      revision: credential.revision,
      active: true,
    });

    invariant(
      sameCredential(decoded, credential) &&
        decoded.counter === credential.counter &&
        decoded.maximumCounter === credential.maximumCounter &&
        decoded.backupState === credential.backupState,
    );
    invariant(summary(mapping, values).credentialId === id);
    owner.postconditions.push(sql`${mapping.clock.engineNowMillis} >= ${now}`);

    return safe;
  });

  return {
    jsonStorage,
    digest,
    currentSubject,
    credentialRows,
    summary,
    ownedCredential,
    managementPolicy,
    metadataAllowed,
    enrollmentDigest,
    removeDigest,
    authorizeAction,
    invalidationMatches,
    invalidate,
    validRegistration,
    insertCredential,
  };
};
