/* oxlint-disable no-explicit-any -- existing mapped-row bridge; public adapters preserve table, ID, and Effect types. */

import {
  PasskeyCredentialSummary,
  PasskeyRemoved,
  type PasskeyManagementPersistence,
} from "@yielded/auth/Passkey";
import { Effect, Schema } from "effect";

import type { PersistenceMappingError } from "../mapping-error";
import type { SqlExpression as SQL, QueryOperations } from "../query-operations";
import type { makeTransactionKernel } from "../transaction-kernel";
import type { makePasskeyAdmissionKernel } from "./admission";
import type { makePasskeyCredentialsKernel } from "./credentials";
import { CurrentPasskeyTransaction } from "./state";
import type { makePasskeyStateKernel } from "./state";
import type { WriteSubject, makePasskeyWriteStateKernel } from "./write-state";

type Port = PasskeyManagementPersistence["Service"];

export const makePasskeyManagementKernel = (
  operations: QueryOperations,
  admission: Pick<ReturnType<typeof makePasskeyAdmissionKernel>, "lockAdmission">,
  credentials: Pick<
    ReturnType<typeof makePasskeyCredentialsKernel>,
    "readModule" | "readPolicyGuards"
  >,
  state: Pick<
    ReturnType<typeof makePasskeyStateKernel>,
    "credentialKey" | "copiedRow" | "equal" | "invariant" | "sameCredential" | "sameRevision"
  >,
  writeState: Pick<
    ReturnType<typeof makePasskeyWriteStateKernel>,
    | "authorizeAction"
    | "credentialRows"
    | "currentSubject"
    | "invalidate"
    | "invalidationMatches"
    | "jsonStorage"
    | "managementPolicy"
    | "metadataAllowed"
    | "ownedCredential"
    | "removeDigest"
    | "summary"
  >,
  transactions: Pick<ReturnType<typeof makeTransactionKernel>, "both">,
) => {
  const { sql } = operations;
  const { lockAdmission } = admission;
  const { readModule, readPolicyGuards } = credentials;
  const { credentialKey, copiedRow, equal, sameCredential, sameRevision } = state;
  const invariant: (value: unknown) => asserts value = state.invariant;

  const {
    authorizeAction,
    credentialRows,
    currentSubject,
    invalidate,
    invalidationMatches,
    jsonStorage,
    managementPolicy,
    metadataAllowed,
    ownedCredential,
    removeDigest,
    summary,
  } = writeState;

  const { both } = transactions;

  const decisionCodec = jsonStorage(
    Schema.Union([
      Schema.TaggedStruct("Renamed", { credential: PasskeyCredentialSummary }),
      Schema.TaggedStruct("Removed", { result: PasskeyRemoved }),
    ]),
  );

  const intentCodec = jsonStorage(
    Schema.Struct({
      operation: Schema.Literals(["rename", "remove"]),
      credentialId: Schema.String,
      name: Schema.optionalKey(Schema.String),
    }),
  );

  const command = Effect.fn("passkey.managementCommand")(function* (
    mapping: any,
    subject: WriteSubject,
    commandId: string,
    credentialId: string,
    intent: string,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const table = mapping.command;

    const observation = yield* owner.read(
      table.table,
      equal(table.table, { [table.moduleId]: mapping.moduleId, [table.commandId]: commandId }),
      { limit: 1 },
    );

    const row = observation.rows[0];

    if (row === undefined) return { _tag: "New", observation } as const;
    if (
      !mapping.read.subjectIds.equals(row[table.subjectId], subject.nativeId) ||
      row[table.credentialId] !== credentialId ||
      row[table.intent] !== intent
    )
      return { _tag: "Rejected" } as const;

    return { _tag: "Replay", decision: decisionCodec.decode(row[table.decision]) } as const;
  });

  const record = Effect.fn("passkey.recordManagementCommand")(function* (
    mapping: any,
    subject: WriteSubject,
    commandId: string,
    credentialId: string,
    intent: string,
    decision: Parameters<typeof decisionCodec.encode>[0],
    retentionUntilMillis: number,
    observation: any,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const table = mapping.command;

    const inserted = yield* owner.insert(
      table.table,
      {
        ...table.encodeInsert({
          moduleId: mapping.moduleId,
          subjectId: subject.nativeId,
          commandId,
          credentialId,
        }),
        [table.moduleId]: mapping.moduleId,
        [table.commandId]: commandId,
        [table.subjectId]: subject.nativeId,
        [table.credentialId]: credentialId,
        [table.intent]: intent,
        [table.decision]: decisionCodec.encode(decision),
        [table.retentionUntil]: mapping.clock.encodeInstant(retentionUntilMillis),
        [table.version]: owner.marker,
      },
      { [table.moduleId]: mapping.moduleId, [table.commandId]: commandId },
    );

    observation.rows = inserted.rows;
  });

  const access = Effect.fn("passkey.managementAccess")(function* (
    mapping: any,
    moduleId: string,
    subjectId: Parameters<Port["list"]>[0]["subjectId"],
    mutation: boolean,
  ) {
    if (moduleId !== mapping.moduleId || (yield* readModule(mapping)) === undefined)
      return undefined;
    if (mutation) yield* lockAdmission(mapping);
    const subject = yield* currentSubject(mapping, subjectId);

    if (subject === undefined) return undefined;
    yield* readPolicyGuards(mapping);

    return (yield* metadataAllowed(mapping, subject)) ? subject : undefined;
  });

  const listCredentials = Effect.fn("passkey.listCredentials")(function* (
    mapping: any,
    input: Parameters<Port["list"]>[0],
  ) {
    const subject = yield* access(mapping, input.moduleId, input.subjectId, false);

    invariant(subject !== undefined);
    const rows = [...(yield* credentialRows(mapping, subject))];

    rows.sort((left, right) => {
      const a = left[mapping.read.credential.credentialId],
        b = right[mapping.read.credential.credentialId];

      return a < b ? -1 : a > b ? 1 : 0;
    });

    const eligible = rows.filter(
      (row) =>
        input.cursor === undefined || row[mapping.read.credential.credentialId] > input.cursor,
    );

    const page = eligible.slice(0, input.limit);
    const credentials = [];

    for (const row of page) {
      invariant((yield* ownedCredential(mapping, subject, row)) !== undefined);
      credentials.push(summary(mapping, row));
    }

    return {
      credentials,
      ...(eligible.length > input.limit ? { cursor: credentials.at(-1)!.credentialId } : {}),
    };
  });

  const renameCredential = Effect.fn("passkey.renameCredential")(function* (
    mapping: any,
    input: Parameters<Port["rename"]>[0],
  ) {
    const subject = yield* access(mapping, input.moduleId, input.subjectId, true);

    if (subject === undefined) return { _tag: "Rejected" } as const;

    const intent = intentCodec.encode({
      operation: "rename",
      credentialId: input.credentialId,
      name: input.name,
    });

    const prior = yield* command(mapping, subject, input.commandId, input.credentialId, intent);

    if (prior._tag === "Rejected") return prior;
    const rows = yield* credentialRows(mapping, subject);

    const row = rows.find(
      (item) => item[mapping.read.credential.credentialId] === input.credentialId,
    );

    if (row === undefined || (yield* ownedCredential(mapping, subject, row)) === undefined)
      return { _tag: "Rejected" } as const;
    if (prior._tag === "Replay")
      return prior.decision._tag === "Renamed"
        ? { ...prior.decision, replayed: true }
        : ({ _tag: "Rejected" } as const);
    const owner = yield* CurrentPasskeyTransaction;
    const table = mapping.read.credential;

    yield* owner.update(
      table.table,
      { [table.credentialId]: input.credentialId, [table.subjectId]: subject.nativeId },
      { [mapping.write.credential.name]: input.name },
    );
    const credential = summary(mapping, { ...row, [mapping.write.credential.name]: input.name });

    yield* record(
      mapping,
      subject,
      input.commandId,
      input.credentialId,
      intent,
      { _tag: "Renamed", credential },
      input.retentionUntilMillis,
      prior.observation,
    );

    return { _tag: "Renamed", credential, replayed: false } as const;
  });

  const inspectRemove = Effect.fn("passkey.inspectRemove")(function* (
    mapping: any,
    input: Parameters<Port["inspectRemove"]>[0],
  ) {
    const subject = yield* access(mapping, input.moduleId, input.subjectId, false);

    if (subject === undefined) return { _tag: "Rejected" } as const;

    const prior = yield* command(
      mapping,
      subject,
      input.commandId,
      input.credentialId,
      intentCodec.encode({ operation: "remove", credentialId: input.credentialId }),
    );

    if (prior._tag === "Rejected") return prior;
    if (prior._tag === "Replay")
      return prior.decision._tag === "Removed"
        ? ({ _tag: "Replay", result: { ...prior.decision.result, replayed: true } } as const)
        : ({ _tag: "Rejected" } as const);

    const row = (yield* credentialRows(mapping, subject)).find(
      (item) => item[mapping.read.credential.credentialId] === input.credentialId,
    );

    const credential =
      row === undefined ? undefined : yield* ownedCredential(mapping, subject, row);

    return credential === undefined
      ? ({ _tag: "Rejected" } as const)
      : ({ _tag: "Target", credential } as const);
  });

  const removeCredential = Effect.fn("passkey.removeCredential")(function* (
    mapping: any,
    input: Parameters<Port["remove"]>[0],
  ) {
    const subject = yield* access(
      mapping,
      input.moduleId,
      input.credential.revision.subjectId,
      true,
    );

    if (subject === undefined) return { _tag: "Rejected" } as const;
    const id = input.credential.credentialId;
    const intent = intentCodec.encode({ operation: "remove", credentialId: id });
    const prior = yield* command(mapping, subject, input.commandId, id, intent);

    if (prior._tag === "Rejected") return prior;
    if (prior._tag === "Replay")
      return prior.decision._tag === "Removed"
        ? ({ _tag: "Removed", result: { ...prior.decision.result, replayed: true } } as const)
        : ({ _tag: "Rejected" } as const);

    const row = (yield* credentialRows(mapping, subject)).find(
      (item) => item[mapping.read.credential.credentialId] === id,
    );

    const credential =
      row === undefined ? undefined : yield* ownedCredential(mapping, subject, row);

    const policy = managementPolicy(mapping, subject);

    if (
      credential === undefined ||
      !sameCredential(input.credential, credential) ||
      !sameRevision(input.credential.revision, credential.revision) ||
      !invalidationMatches(mapping, input.invalidation, policy) ||
      !invalidationMatches(mapping, input.invalidation, input.management)
    )
      return { _tag: "Rejected" } as const;
    if (
      !(yield* authorizeAction(
        mapping,
        subject,
        input.authorization,
        {
          action: "remove",
          commandId: input.commandId,
          flowId: input.commandId,
          bindingDigest: removeDigest(mapping.moduleId, input.commandId, input.credential),
          revision: input.credential.revision,
        },
        {
          ...policy,
          maximumEvidenceAgeMillis: Math.min(
            policy.maximumEvidenceAgeMillis,
            input.management.maximumEvidenceAgeMillis,
          ),
        },
      ))
    )
      return { _tag: "Rejected" } as const;
    const owner = yield* CurrentPasskeyTransaction;

    const remainingEffect: Effect.Effect<SQL, PersistenceMappingError> =
      mapping.write.policy.remainingSignIn(subject.nativeId, id, copiedRow(subject.row));

    const remaining = yield* remainingEffect;

    if (!(yield* owner.check(remaining))) return { _tag: "LastSignInMethod" } as const;
    const read = mapping.read;
    const table = read.credential;

    yield* owner.update(
      table.table,
      { [table.credentialId]: id, [table.subjectId]: subject.nativeId },
      {
        [table.status]: mapping.write.credential.removedStatus,
        [table.credentialRevision]: owner.marker,
      },
    );
    const factor = read.authority;

    yield* owner.update(
      factor.table,
      { [factor.subjectId]: subject.nativeId, [factor.credentialId]: id },
      { [factor.status]: mapping.write.authority.removedStatus, [factor.revision]: owner.marker },
    );
    for (const observation of owner.observations) {
      if (observation.table === table.table)
        observation.rows = observation.rows.filter((item) => item[table.credentialId] !== id);
      if (observation.table === factor.table)
        observation.rows = observation.rows.filter((item) => item[factor.credentialId] !== id);
    }
    const tuple = read.credentialOwnership;

    yield* owner.update(
      tuple.table,
      { [tuple.credentialKey]: credentialKey(credential.rpId, credential.protocolCredentialId) },
      {
        [tuple.state]: mapping.write.credentialOwnership.removedState,
        [tuple.version]: owner.marker,
      },
    );
    yield* invalidate(mapping, subject, input.invalidation);
    owner.postconditions.push(
      remaining,
      sql`not exists(select 1 from ${table.table} where ${both(equal(table.table, { [table.credentialId]: id }), table.activeCondition)})`,
      sql`not exists(select 1 from ${factor.table} where ${both(equal(factor.table, { [factor.subjectId]: subject.nativeId, [factor.credentialId]: id }), factor.activeCondition)})`,
    );

    const result = {
      credentialId: credential.credentialId,
      replayed: false,
      invalidation: input.invalidation,
    };

    yield* record(
      mapping,
      subject,
      input.commandId,
      id,
      intent,
      { _tag: "Removed", result },
      input.retentionUntilMillis,
      prior.observation,
    );

    return { _tag: "Removed", result } as const;
  });

  return { listCredentials, renameCredential, inspectRemove, removeCredential };
};
