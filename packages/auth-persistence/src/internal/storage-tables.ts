import { Schema } from "effect";

export const StorageColumn = Schema.Struct({
  name: Schema.NonEmptyString,
  type: Schema.Literals(["text", "integer", "boolean"]),
  nullable: Schema.optionalKey(Schema.Boolean),
});

export const StorageTable = Schema.Struct({
  name: Schema.NonEmptyString,
  schema: Schema.optionalKey(Schema.NonEmptyString),
  columns: Schema.Record(Schema.String, StorageColumn),
  unique: Schema.Array(Schema.Array(Schema.String)),
});

export type StorageTable = typeof StorageTable.Type;

const text = { type: "text" as const };
const integer = { type: "integer" as const };
const boolean = { type: "boolean" as const };
const optionalText = { ...text, nullable: true };
const optionalInteger = { ...integer, nullable: true };

const spec = <C extends Readonly<Record<string, Omit<typeof StorageColumn.Type, "name">>>>(
  columns: C,
  unique: ReadonlyArray<ReadonlyArray<Extract<keyof C, string>>>,
) => ({ columns, unique });

/** Logical roles are independent of table names and migration ownership. */
export const storageTables = {
  subjects: spec({ id: text, active: boolean, securityRevision: text }, [["id"]]),
  identifiers: spec(
    {
      namespace: text,
      value: text,
      subjectId: text,
      revision: text,
      verifiedAt: optionalInteger,
      active: boolean,
    },
    [["namespace", "value"]],
  ),
  credentials: spec({ credentialId: text, subjectId: text, revision: text, active: boolean }, [
    ["credentialId"],
  ]),
  passwords: spec(
    {
      moduleId: text,
      subjectId: text,
      credentialId: text,
      credentialRevision: text,
      verifierVersion: text,
      verifier: text,
      normalization: text,
    },
    [
      ["moduleId", "subjectId"],
      ["moduleId", "credentialId"],
    ],
  ),
  passwordAttempts: spec(
    {
      moduleId: text,
      action: text,
      attemptId: text,
      identifierNamespace: text,
      identifierValue: text,
      subjectId: optionalText,
      credentialId: optionalText,
      securityRevision: optionalText,
      credentialRevision: optionalText,
      verifierVersion: optionalText,
      identifierBindingRevision: optionalText,
      admittedAt: integer,
      deadline: integer,
      retentionUntil: integer,
      state: text,
    },
    [["moduleId", "attemptId"]],
  ),
  passwordScopes: spec({ moduleId: text, action: text, scopeKind: text, scopeKey: text }, [
    ["moduleId", "action", "scopeKind", "scopeKey"],
  ]),
  passwordCharges: spec(
    {
      moduleId: text,
      action: text,
      scopeKind: text,
      scopeKey: text,
      attemptId: text,
      occurredAt: integer,
      retentionUntil: integer,
    },
    [["moduleId", "action", "scopeKind", "scopeKey", "attemptId"]],
  ),
  passwordCommands: spec(
    {
      moduleId: text,
      commandId: text,
      action: text,
      bindingDigest: text,
      decision: text,
      retentionUntil: integer,
    },
    [["moduleId", "commandId"]],
  ),
  passwordRegistrations: spec({ moduleId: text, requestId: text }, [["moduleId", "requestId"]]),
  emailCredentials: spec(
    {
      moduleId: text,
      subjectId: text,
      credentialId: text,
      identifierNamespace: text,
      identifierValue: text,
      credentialRevision: text,
      active: boolean,
    },
    [
      ["moduleId", "credentialId"],
      ["moduleId", "identifierNamespace", "identifierValue"],
    ],
  ),
  emailCommands: spec(
    { moduleId: text, commandId: text, action: text, bindingDigest: text, retentionUntil: integer },
    [["moduleId", "commandId"]],
  ),
  phoneState: spec({ scope: text, state: text, version: text }, [["scope"]]),
  passkeyCredentials: spec(
    {
      credentialId: text,
      subjectId: text,
      rpId: text,
      protocolCredentialId: text,
      credentialKey: text,
      handleKey: text,
      userHandle: text,
      publicKey: text,
      algorithm: integer,
      profile: text,
      credentialRevision: text,
      active: boolean,
      primarySignIn: boolean,
      enrollmentUserVerified: boolean,
      backupEligible: boolean,
      backupState: boolean,
      counter: integer,
      maximumCounter: integer,
      name: text,
      createdAt: integer,
      lastUsedAt: optionalInteger,
    },
    [["credentialId"], ["credentialKey"]],
  ),
  passkeyOwnership: spec(
    {
      credentialKey: text,
      rpId: text,
      protocolCredentialId: text,
      subjectId: optionalText,
      credentialId: optionalText,
      state: text,
      version: text,
      reservationId: optionalText,
    },
    [["credentialKey"]],
  ),
  passkeyHandles: spec(
    {
      handleKey: text,
      rpId: text,
      userHandle: text,
      subjectId: optionalText,
      state: text,
      version: text,
      reservationId: optionalText,
    },
    [["handleKey"], ["rpId", "subjectId"]],
  ),
  passkeyModules: spec(
    {
      moduleId: text,
      active: boolean,
      policyRevision: text,
      policy: text,
    },
    [["moduleId"]],
  ),
  passkeyFlows: spec(
    {
      moduleId: text,
      flowId: text,
      commandId: text,
      purpose: text,
      state: text,
      version: text,
      generation: integer,
      snapshot: text,
      policySnapshot: text,
      requestBindingVerifier: text,
      requestBindingExpiresAt: integer,
      issuedAt: integer,
      expiresAt: integer,
      retentionUntil: integer,
      claimId: optionalText,
      claimedAt: optionalInteger,
      claimExpiresAt: optionalInteger,
      credentialSnapshot: optionalText,
      subjectScope: optionalText,
      targetScope: optionalText,
    },
    [
      ["moduleId", "flowId"],
      ["moduleId", "commandId"],
    ],
  ),
  passkeyAdmissions: spec(
    {
      authorityScope: text,
      moduleId: text,
      version: text,
      ownerMarker: text,
      admittedAt: optionalInteger,
    },
    [["authorityScope", "moduleId"]],
  ),
  passkeyCharges: spec(
    {
      moduleId: text,
      flowId: text,
      purpose: text,
      kind: text,
      scope: text,
      originalWindowMillis: integer,
      admittedAt: optionalInteger,
      retainUntil: optionalInteger,
      version: text,
      ownerMarker: text,
    },
    [["moduleId", "flowId", "kind"]],
  ),
  passkeyCommands: spec(
    {
      moduleId: text,
      commandId: text,
      subjectId: text,
      credentialId: text,
      intent: text,
      decision: text,
      retentionUntil: integer,
      version: text,
    },
    [["moduleId", "commandId"]],
  ),
  proofRequests: spec(
    {
      moduleId: text,
      requestId: text,
      fingerprint: text,
      proofId: text,
      purpose: text,
      keyId: text,
      createdAt: integer,
      retentionUntil: integer,
      receipt: text,
    },
    [["moduleId", "requestId"]],
  ),
  proofSeries: spec(
    {
      moduleId: text,
      purpose: text,
      scopeKey: text,
      activeProofId: optionalText,
      lastIssueAt: optionalInteger,
      version: text,
    },
    [["moduleId", "purpose", "scopeKey"]],
  ),
  proofGenerations: spec(
    {
      moduleId: text,
      purpose: text,
      proofId: text,
      requestId: text,
      seriesKey: text,
      deliveryId: text,
      binding: text,
      verifierKeyId: text,
      verifierDigest: text,
      issuedAt: integer,
      expiresAt: integer,
      version: text,
      state: text,
      sendCount: integer,
      deliveryState: text,
      claimVersion: optionalText,
      claimDeadline: optionalInteger,
      retryAt: optionalInteger,
      deliveryRetryMillis: integer,
      retentionUntil: integer,
      fingerprint: text,
    },
    [
      ["moduleId", "proofId"],
      ["moduleId", "deliveryId"],
    ],
  ),
  proofContinuations: spec(
    {
      moduleId: text,
      purpose: text,
      continuationId: text,
      digest: text,
      proofId: text,
      seriesKey: text,
      binding: text,
      expiresAt: integer,
      consumed: boolean,
      version: text,
      retentionUntil: integer,
    },
    [
      ["moduleId", "continuationId"],
      ["moduleId", "digest"],
    ],
  ),
  proofScopes: spec(
    { moduleId: text, purpose: text, action: text, scopeKind: text, scopeKey: text },
    [["moduleId", "purpose", "action", "scopeKind", "scopeKey"]],
  ),
  proofAbuse: spec(
    {
      moduleId: text,
      purpose: text,
      action: text,
      scopeKind: text,
      scopeKey: text,
      commandId: text,
      occurredAt: integer,
      retentionUntil: integer,
    },
    [["moduleId", "action", "scopeKind", "scopeKey", "commandId"]],
  ),
  proofFailures: spec(
    {
      moduleId: text,
      purpose: text,
      seriesKey: text,
      commandId: text,
      occurredAt: integer,
      retentionUntil: integer,
    },
    [["moduleId", "seriesKey", "commandId"]],
  ),
  proofCommands: spec(
    { moduleId: text, commandId: text, kind: text, decision: text, retentionUntil: integer },
    [["moduleId", "commandId"]],
  ),
  sessions: spec(
    {
      sessionId: text,
      subjectId: text,
      digest: text,
      version: text,
      securityRevision: text,
      issuedAt: integer,
      expiresAt: integer,
      absoluteExpiresAt: integer,
      record: text,
    },
    [["sessionId"], ["digest"]],
  ),
  sessionFlows: spec(
    {
      flowId: text,
      subjectId: text,
      state: text,
      pendingDigest: optionalText,
      dedupUntil: integer,
    },
    [["flowId"]],
  ),
} as const;

export type StorageRole = keyof typeof storageTables;

export const tableDefinition = (
  role: StorageRole,
  name: string,
  subjectType: "text" | "integer" = "text",
): StorageTable => {
  const table = storageTables[role];

  return {
    name,
    columns: Object.fromEntries(
      Object.entries(table.columns).map(([key, column]) => [
        key,
        {
          ...column,
          name: key.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase()),
          ...(key === "subjectId" ? { type: subjectType } : {}),
        },
      ]),
    ),
    unique: table.unique,
  };
};
