import {
  NativeDatabase,
  PersistenceMappingError,
  validateStorage,
} from "@yielded/auth-persistence/Adapter";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import { getTableConfig as getMysqlTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import { getTableConfig as getPgTableConfig, PgTable } from "drizzle-orm/pg-core";
import { Effect, Predicate, Schema } from "effect";
import { SqlClient } from "effect/sql/SqlClient";

// These are mapping contracts, not a parser for arbitrary constraint declarations.
// Role aliases are explicit because their documentation names differ from mapping fields.
const uniquePlans: Readonly<Record<string, readonly [string, ReadonlyArray<string>]>> = {
  "unique(abuseEvent.moduleId,abuseEvent.action,abuseEvent.scopeKind,abuseEvent.scopeKey,abuseEvent.commandId)":
    ["abuseEvent", ["moduleId", "action", "scopeKind", "scopeKey", "commandId"]],
  "unique(admission.moduleId)": ["admission", ["moduleId"]],
  "unique(attempt.moduleId,attempt.attemptId)": ["attempt", ["moduleId", "attemptId"]],
  "unique(authority.subjectId,authority.credentialId)": [
    "authority",
    ["subjectId", "credentialId"],
  ],
  "unique(authorityCredential.subjectId,authorityCredential.credentialId)": [
    "authorityCredential",
    ["subjectId", "credentialId"],
  ],
  "unique(charge.moduleId,charge.action,charge.scopeKind,charge.scopeKey,charge.attemptId)": [
    "charge",
    ["moduleId", "action", "scopeKind", "scopeKey", "attemptId"],
  ],
  "unique(command.moduleId,command.commandId)": ["command", ["moduleId", "commandId"]],
  "unique(connectedAdmission.admissionId)": ["admission", ["admissionId"]],
  "unique(connectedClient.clientKey)": ["client", ["clientKey"]],
  "unique(connectedCohort.cohortKey)": ["cohort", ["cohortKey"]],
  "unique(connectedCommand.moduleId,connectedCommand.commandId)": [
    "command",
    ["moduleId", "commandId"],
  ],
  "unique(connectedFlow.moduleId,connectedFlow.commandId)": ["flow", ["moduleId", "commandId"]],
  "unique(connectedFlow.moduleId,connectedFlow.flowId)": ["flow", ["moduleId", "flowId"]],
  "unique(connectedFlow.stateDigest)": ["flow", ["stateDigest"]],
  "unique(connectedGrant.moduleId,connectedGrant.grantId)": ["grant", ["moduleId", "grantId"]],
  "unique(connectedGrant.moduleId,connectedGrant.subjectId,connectedGrant.profileKey,connectedGrant.activeIdentityKey)":
    ["grant", ["moduleId", "subjectId", "profileKey", "activeIdentityKey"]],
  "unique(connectedRevocation.jobId)": ["job", ["jobId"]],
  "unique(continuation.moduleId,continuation.continuationId)": [
    "continuation",
    ["moduleId", "continuationId"],
  ],
  "unique(continuation.moduleId,continuation.digest)": ["continuation", ["moduleId", "digest"]],
  "unique(credential.credentialId)": ["credential", ["credentialId"]],
  "unique(credential.identityKey)": ["credential", ["identityKey"]],
  "unique(credential.moduleId,credential.credentialId)": [
    "credential",
    ["moduleId", "credentialId"],
  ],
  "unique(credential.moduleId,credential.subjectId)": ["credential", ["moduleId", "subjectId"]],
  "unique(emailCommand.moduleId,emailCommand.commandId)": ["command", ["moduleId", "commandId"]],
  "unique(emailCredential.moduleId,emailCredential.credentialId)": [
    "credential",
    ["moduleId", "credentialId"],
  ],
  "unique(emailCredential.moduleId,emailCredential.identifierNamespace,emailCredential.identifierValue)":
    ["credential", ["moduleId", "identifierNamespace", "identifierValue"]],
  "unique(emailRegistration.moduleId,emailRegistration.commandId)": [
    "registration",
    ["moduleId", "commandId"],
  ],
  "unique(emailRegistration.pendingReference)": ["registration", ["pendingReference"]],
  "unique(failureEvent.moduleId,failureEvent.seriesKey,failureEvent.commandId)": [
    "failureEvent",
    ["moduleId", "seriesKey", "commandId"],
  ],
  "unique(flow.flowId)": ["flow", ["flowId"]],
  "unique(flow.moduleId,flow.commandId)": ["flow", ["moduleId", "commandId"]],
  "unique(flow.moduleId,flow.flowId)": ["flow", ["moduleId", "flowId"]],
  "unique(flow.stateDigest)": ["flow", ["stateDigest"]],
  "unique(generation.moduleId,generation.deliveryId)": ["generation", ["moduleId", "deliveryId"]],
  "unique(generation.moduleId,generation.proofId)": ["generation", ["moduleId", "proofId"]],
  "unique(identifier.namespace,identifier.value)": ["identifier", ["namespace", "value"]],
  "unique(intent.digest)": ["intent", ["digest"]],
  "unique(intent.flowId)": ["intent", ["flowId"]],
  "unique(intent.moduleId,intent.commandId)": ["intent", ["moduleId", "commandId"]],
  "unique(intent.moduleId,intent.flowId)": ["intent", ["moduleId", "flowId"]],
  "unique(intent.moduleId,intent.intentId)": ["intent", ["moduleId", "intentId"]],
  "unique(intent.moduleId,intent.reference)": ["intent", ["moduleId", "reference"]],
  "unique(ownership.identityKey)": ["ownership", ["identityKey"]],
  "unique(pending.digest)": ["pending", ["digest"]],
  "unique(pending.flowId)": ["pending", ["flowId"]],
  "unique(rateScope.moduleId,rateScope.action,rateScope.scopeKind,rateScope.scopeKey)": [
    "rateScope",
    ["moduleId", "action", "scopeKind", "scopeKey"],
  ],
  "unique(rateScope.moduleId,rateScope.purpose,rateScope.action,rateScope.scopeKind,rateScope.scopeKey)":
    ["rateScope", ["moduleId", "purpose", "action", "scopeKind", "scopeKey"]],
  "unique(registration.moduleId,registration.requestId)": [
    "registration",
    ["moduleId", "requestId"],
  ],
  "unique(registration.recoveryReference)": ["registration", ["recoveryReference"]],
  "unique(registrationCommand.moduleId,registrationCommand.commandId)": [
    "command",
    ["moduleId", "commandId"],
  ],
  "unique(request.moduleId,request.requestId)": ["request", ["moduleId", "requestId"]],
  "unique(series.moduleId,series.purpose,series.scopeKey)": [
    "series",
    ["moduleId", "purpose", "scopeKey"],
  ],
  "unique(session.digest)": ["session", ["digest"]],
  "unique(tombstone.subjectId,tombstone.sessionId)": ["tombstone", ["subjectId", "sessionId"]],
  "unique(tuple.identityKey)": ["ownership.tuple", ["identityKey"]],
  "unique(unlinkCommand.moduleId,unlinkCommand.commandId)": ["command", ["moduleId", "commandId"]],
};

const arrayRoles: Readonly<Record<string, string>> = {
  credentialId: "credential",
  factor: "authority",
  credentialOwnership: "credentialOwnership",
  handleOwnership: "handleOwnership",
  boundSubjectHandle: "handleOwnership",
  flow: "flow",
  command: "flow",
  admission: "admission",
  charge: "charge",
  intentFlow: "intent",
  intentCommand: "intent",
  handle: "handle",
};

const nestedMappings = [
  "read",
  "signIn",
  "password",
  "proof",
  "proofs",
  "revocation",
  "pending",
  "session",
  "source",
];

const constraintGroups = [
  "constraints",
  "tupleConstraints",
  "registrationConstraints",
  "managementConstraints",
];

const MappingRecord = Schema.Record(Schema.String, Schema.Unknown);
const record = Schema.decodeUnknownSync(MappingRecord);

const plans = (mapping: Readonly<Record<string, unknown>>) => {
  const result: Array<{ readonly table: Table; readonly keys: ReadonlyArray<string> }> = [];

  for (const group of constraintGroups) {
    if (mapping[group] === undefined) continue;
    for (const [name, declaration] of Object.entries(record(mapping[group]))) {
      if (declaration === "notNull(provisioningRequest.subjectId)") continue;
      let role: string;
      let keys: ReadonlyArray<string>;

      if (typeof declaration === "string") {
        const plan = uniquePlans[declaration];

        if (plan !== undefined) [role, keys] = plan;
        else if (declaration === "unique(id)") {
          role = "subject";
          keys = ["id"];
        } else if (declaration === "unique(scope)") {
          role = name;
          keys = ["scope"];
        } else if (declaration === "unique(credentialId)") {
          role = "credential";
          keys = ["id"];
        } else if (declaration === "unique(namespace,value)") {
          role = "identifier";
          keys = ["namespace", "value"];
        } else if (declaration === "unique(provider,issuer,subject)") {
          role = "externalIdentity";
          keys = ["provider", "issuer", "subject"];
        } else if (declaration === "unique(requestId)") {
          role = "provisioningRequest";
          keys = ["requestId"];
        } else throw new Error("Unknown storage constraint");
      } else if (Array.isArray(declaration) && declaration.every(Predicate.isString)) {
        const mappedRole =
          group === "managementConstraints" && name === "command" ? "command" : arrayRoles[name];

        if (mappedRole === undefined) throw new Error("Unknown storage constraint");
        role = mappedRole;
        keys = declaration;
      } else throw new Error("Invalid storage constraint");

      let target: unknown = mapping;

      for (const segment of role.split(".")) target = record(target)[segment];
      // Session authority places its pending tables in one nested mapping.
      if (target === undefined && Schema.is(MappingRecord)(mapping.pending))
        target = mapping.pending[role];
      let mapped = record(target);

      if (role === "pending" && mapped.table === undefined) mapped = record(mapped.pending);
      // OAuth ownership can be integrated into its tuple authority or separate.
      if (role === "ownership" && mapped.table === undefined)
        mapped = record(mapped.external ?? mapped.tuple);
      if (!is(mapped.table, Table)) throw new Error("Missing storage table");
      const columns = getTableColumns(mapped.table);

      result.push({
        table: mapped.table,
        keys: keys.map((key) => {
          const value = mapped[key];

          if (typeof value !== "string" || columns[value] === undefined)
            throw new Error("Missing mapped key");

          return value;
        }),
      });
    }
  }
  for (const nested of nestedMappings) {
    const value = mapping[nested];

    if (Schema.is(MappingRecord)(value) && value.table === undefined) result.push(...plans(value));
  }

  return result;
};

/** Validate at acquisition using the root database supplied by the adapter. */
export const validateDrizzleStorage = Effect.fnUntraced(
  function* (mapping: unknown) {
    const physical = yield* Effect.try({
      try: () => plans(record(mapping)),
      catch: () =>
        PersistenceMappingError.make({
          operation: "mapping",
          cause: "Invalid storage key mapping",
        }),
    });

    const { $client: client } = yield* NativeDatabase;

    for (const plan of physical) {
      const pg = is(plan.table, PgTable);
      const mysql = is(plan.table, MySqlTable);

      const schema = pg
        ? getPgTableConfig(plan.table).schema
        : mysql
          ? getMysqlTableConfig(plan.table).schema
          : undefined;

      const columns = getTableColumns(plan.table);

      yield* validateStorage(
        pg ? "pg" : mysql ? "mysql" : "sqlite",
        {
          name: getTableName(plan.table),
          ...(schema === undefined ? {} : { schema }),
          columns: Object.fromEntries(plan.keys.map((key) => [key, { name: columns[key]!.name }])),
        },
        [plan.keys],
      ).pipe(
        Effect.provideService(SqlClient, client),
        Effect.mapError(() =>
          PersistenceMappingError.make({
            operation: "mapping",
            cause: "Required SQL storage key is unavailable",
          }),
        ),
      );
    }
  },
  Effect.catchDefect(() =>
    Effect.fail(
      PersistenceMappingError.make({
        operation: "mapping",
        cause: "Cannot inspect SQL storage metadata",
      }),
    ),
  ),
);
