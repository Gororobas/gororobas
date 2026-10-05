import { randomId } from "@yielded/auth-crypto";
import { EmailCredentialSnapshot } from "@yielded/auth/Email";
import { LoginIdentifier } from "@yielded/auth/Identity";
import {
  PasswordAttemptId,
  PasswordCredentialSnapshot,
  EncodedPasswordHash,
  type PasswordReplacement,
} from "@yielded/auth/Password";
import {
  ProofBinding,
  ProofContinuationId,
  ProofDeliveryId,
  ProofId,
  ProofPurpose,
  ProofRequestId,
  ProofRequestReceipt,
  ProofVersion,
} from "@yielded/auth/Proofs";
import { TokenDigest } from "@yielded/auth/Schema";
import {
  SecurityRevision,
  SessionId,
  SessionMetadata,
  SessionAuthenticationProvenance,
  SessionCredentialVersion,
  type StatefulSessionRecord,
} from "@yielded/auth/Sessions";
import { DateTime, Effect, Redacted, Schema } from "effect";

import type { MappingInput } from "./configuration";
import { PersistenceMappingError } from "./mapping-error";
import { requiredEmailAddressConstraints, type AnyEmailAddressMapping } from "./models/email-model";
import {
  requiredPasswordConstraints,
  type AnyPasswordPersistenceMapping,
} from "./models/password-model";
import { requiredProofConstraints, type AnyProofPersistenceMapping } from "./models/proof-model";
import type { StatefulSessionMapping } from "./models/session-model";
import type { TableModel, SqlFragment } from "./query-operations";
import { storageTables, type StorageRole } from "./storage-tables";

const failure = (cause: unknown) => PersistenceMappingError.make({ operation: "decode", cause });

const decode = <S extends Schema.Codec<unknown, unknown>>(schema: S, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(failure));

const string = (value: unknown) => Schema.decodeUnknownSync(Schema.String)(value);
const tuple = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)));
const bindingJson = Schema.fromJsonString(ProofBinding);
const receiptJson = Schema.fromJsonString(ProofRequestReceipt);

const ProofRecord = Schema.Struct({
  moduleId: Schema.String,
  purpose: ProofPurpose,
  proofId: ProofId,
  requestId: ProofRequestId,
  fingerprint: TokenDigest,
  deliveryId: ProofDeliveryId,
  binding: ProofBinding,
  verifier: Schema.Struct({ keyId: Schema.String, digest: TokenDigest }),
  issuedAtMillis: Schema.Int,
  expiresAtMillis: Schema.Int,
  version: ProofVersion,
});

const ProofContinuation = Schema.Struct({
  moduleId: Schema.String,
  purpose: ProofPurpose,
  continuationId: ProofContinuationId,
  digest: TokenDigest,
  proofId: ProofId,
  seriesKey: Schema.String,
  binding: ProofBinding,
  expiresAtMillis: Schema.Int,
  version: ProofVersion,
});

/** Derive shared row mappings from a managed or custom storage layout.
 * Each factory requires its role tables to exist. Adapter authors supply typed
 * table handles and dialect-specific clocks/commit predicates, and may refine
 * authority policy for explicit services. This does not alter composed defaults.
 */
export const makeMappings = (input: MappingInput) => {
  const table = (role: StorageRole) => {
    const found = input.tables[role];

    if (found === undefined) throw failure(`Missing ${role} mapping`);

    return found;
  };

  const mapped = (role: StorageRole) => ({
    table: table(role),
    ...Object.fromEntries(Object.keys(storageTables[role].columns).map((key) => [key, key])),
  });

  const { subjects: s, encodeInstant: instant, decodeInstant: readInstant } = input;
  const subjectId = { toNative: s.toNative, toSubject: s.toSubject, equals: Object.is };

  const subject = {
    table: s.table,
    id: s.id,
    status: s.status,
    securityRevision: s.securityRevision,
    isActiveStatus: (value: unknown) => Object.is(value, s.activeValue),
    d1ActiveStatusValue: s.activeValue,
    decodeRequirement: s.requirements,
    decodeActionRequirement: s.actionRequirements,
    nextSecurityRevisionSync: () => SecurityRevision.make(randomId()),
  };

  const authorityCredential = () => ({
    ...mapped("credentials"),
    subjectId: "subjectId",
    credentialId: "credentialId",
    revision: "revision",
    status: "active",
    isActiveStatus: (value: unknown) => value === true,
    encodeInsert: (row: object) => ({ ...row, active: true }),
    encodeRevision: (revision: SecurityRevision) => ({ revision }),
  });

  const authority = () => ({ subjectId, subject, credential: authorityCredential() });

  const proofs = (): AnyProofPersistenceMapping<SqlFragment> => ({
    constraints: requiredProofConstraints,
    encodeInstant: instant,
    decodeInstant: readInstant,
    allocateVersionSync: () => ProofVersion.make(randomId()),
    isRequestConflict: () => false,
    isSeriesConflict: () => false,
    isCommandConflict: () => false,
    scopeKeys: ({ binding }) => ({
      series: tuple([
        binding.identifier.namespace,
        binding.identifier.value,
        binding._tag === "Identifier" ? "anonymous" : binding.revision.subjectId,
      ]),
      identifier: tuple([binding.identifier.namespace, binding.identifier.value]),
      subject: binding._tag === "Identifier" ? "anonymous" : binding.revision.subjectId,
    }),
    authority: {
      ...authority(),
      identifier: {
        table: table("identifiers"),
        namespace: "namespace",
        value: "value",
        isCurrent: (request, rows) =>
          request.binding._tag === "Identifier"
            ? rows.length === 0
            : request.binding._tag === "IdentifierChange"
              ? rows.length === 0 ||
                (rows.length === 1 &&
                  rows.every(
                    (row) =>
                      Object.is(row.subjectId, request.nativeSubjectId) &&
                      row.active === true &&
                      row.verifiedAt === null,
                  ))
              : rows.length === 1 &&
                rows.every(
                  (row) => Object.is(row.subjectId, request.nativeSubjectId) && row.active === true,
                ),
      },
    },
    request: {
      ...mapped("proofRequests"),
      moduleId: "moduleId",
      requestId: "requestId",
      fingerprint: "fingerprint",
      proofId: "proofId",
      purpose: "purpose",
      keyId: "keyId",
      createdAt: "createdAt",
      retentionUntil: "retentionUntil",
      encodeInsert: ({ record, retentionUntilMillis }) => ({
        moduleId: record.moduleId,
        requestId: record.requestId,
        fingerprint: record.fingerprint,
        proofId: record.proofId,
        purpose: record.purpose,
        keyId: record.verifier.keyId,
        createdAt: instant(record.issuedAtMillis),
        retentionUntil: instant(retentionUntilMillis),
        receipt: Schema.encodeSync(receiptJson)({
          requestId: record.requestId,
          reference: {
            proofId: record.proofId,
            purpose: record.purpose,
            keyId: record.verifier.keyId,
          },
        }),
      }),
      decodeReceipt: (row) => decode(receiptJson, row.receipt),
    },
    series: {
      ...mapped("proofSeries"),
      moduleId: "moduleId",
      purpose: "purpose",
      scopeKey: "scopeKey",
      activeProofId: "activeProofId",
      lastIssueAt: "lastIssueAt",
      version: "version",
      encodeInsert: (row) => ({ ...row, activeProofId: null, lastIssueAt: null }),
    },
    generation: {
      ...mapped("proofGenerations"),
      moduleId: "moduleId",
      purpose: "purpose",
      proofId: "proofId",
      requestId: "requestId",
      seriesKey: "seriesKey",
      deliveryId: "deliveryId",
      binding: "binding",
      verifierKeyId: "verifierKeyId",
      verifierDigest: "verifierDigest",
      issuedAt: "issuedAt",
      expiresAt: "expiresAt",
      version: "version",
      state: "state",
      sendCount: "sendCount",
      deliveryState: "deliveryState",
      claimVersion: "claimVersion",
      claimDeadline: "claimDeadline",
      retryAt: "retryAt",
      deliveryRetryMillis: "deliveryRetryMillis",
      retentionUntil: "retentionUntil",
      encodeInsert: ({
        record,
        seriesKey,
        retentionUntilMillis,
        state,
        deliveryState,
        policy,
      }) => ({
        moduleId: record.moduleId,
        purpose: record.purpose,
        proofId: record.proofId,
        requestId: record.requestId,
        seriesKey,
        deliveryId: record.deliveryId,
        binding: Schema.encodeSync(bindingJson)(record.binding),
        verifierKeyId: record.verifier.keyId,
        verifierDigest: record.verifier.digest,
        issuedAt: instant(record.issuedAtMillis),
        expiresAt: instant(record.expiresAtMillis),
        version: record.version,
        state,
        sendCount: 0,
        deliveryState,
        claimVersion: null,
        claimDeadline: null,
        retryAt: null,
        deliveryRetryMillis: policy.deliveryRetryMillis,
        retentionUntil: instant(retentionUntilMillis),
        fingerprint: record.fingerprint,
      }),
      decodeBinding: (row) => decode(bindingJson, row.binding),
      decodeRecord: (row) =>
        Effect.gen(function* () {
          return yield* decode(ProofRecord, {
            moduleId: row.moduleId,
            purpose: row.purpose,
            proofId: row.proofId,
            requestId: row.requestId,
            fingerprint: row.fingerprint,
            deliveryId: row.deliveryId,
            binding: yield* decode(bindingJson, row.binding),
            verifier: { keyId: row.verifierKeyId, digest: row.verifierDigest },
            issuedAtMillis: yield* readInstant(row.issuedAt),
            expiresAtMillis: yield* readInstant(row.expiresAt),
            version: row.version,
          });
        }),
    },
    continuation: {
      ...mapped("proofContinuations"),
      moduleId: "moduleId",
      purpose: "purpose",
      continuationId: "continuationId",
      digest: "digest",
      proofId: "proofId",
      seriesKey: "seriesKey",
      binding: "binding",
      expiresAt: "expiresAt",
      consumed: "consumed",
      version: "version",
      retentionUntil: "retentionUntil",
      encodeInsert: (record) => ({
        ...record,
        binding: Schema.encodeSync(bindingJson)(record.binding),
        expiresAt: instant(record.expiresAtMillis),
        consumed: false,
        retentionUntil: instant(record.retentionUntilMillis),
      }),
      decode: (row) =>
        Effect.gen(function* () {
          return yield* decode(ProofContinuation, {
            ...row,
            binding: yield* decode(bindingJson, row.binding),
            expiresAtMillis: yield* readInstant(row.expiresAt),
          });
        }),
    },
    rateScope: {
      ...mapped("proofScopes"),
      moduleId: "moduleId",
      purpose: "purpose",
      action: "action",
      scopeKind: "scopeKind",
      scopeKey: "scopeKey",
      encodeInsert: (row) => ({ ...row }),
    },
    abuseEvent: {
      ...mapped("proofAbuse"),
      moduleId: "moduleId",
      purpose: "purpose",
      action: "action",
      scopeKind: "scopeKind",
      scopeKey: "scopeKey",
      commandId: "commandId",
      occurredAt: "occurredAt",
      retentionUntil: "retentionUntil",
      encodeInsert: (row) => ({
        ...row,
        occurredAt: instant(row.occurredAtMillis),
        retentionUntil: instant(row.retentionUntilMillis),
      }),
    },
    failureEvent: {
      ...mapped("proofFailures"),
      moduleId: "moduleId",
      purpose: "purpose",
      seriesKey: "seriesKey",
      commandId: "commandId",
      occurredAt: "occurredAt",
      retentionUntil: "retentionUntil",
      encodeInsert: (row) => ({
        ...row,
        occurredAt: instant(row.occurredAtMillis),
        retentionUntil: instant(row.retentionUntilMillis),
      }),
    },
    command: {
      ...mapped("proofCommands"),
      moduleId: "moduleId",
      commandId: "commandId",
      kind: "kind",
      decision: "decision",
      retentionUntil: "retentionUntil",
      encodeInsert: (row) => ({ ...row, retentionUntil: instant(row.retentionUntilMillis) }),
    },
  });

  const passwords = (): AnyPasswordPersistenceMapping<SqlFragment> => {
    const verifier = (replacement: PasswordReplacement) => ({
      verifier: Redacted.value(replacement.verifier),
      normalization: replacement.normalization,
    });

    return {
      subjectId,
      subject,
      authorityCredential: authorityCredential(),
      constraints: requiredPasswordConstraints,
      isCommandConflict: () => false,
      isRateScopeConflict: () => false,
      scopeKeys: ({ moduleId, action, identifier, subjectId }) => ({
        action: tuple([moduleId, action]),
        identifier: tuple([identifier.namespace, identifier.value]),
        ...(subjectId === undefined ? {} : { subject: subjectId }),
      }),
      encodeInstant: instant,
      decodeInstant: readInstant,
      allocateAttemptIdSync: () => PasswordAttemptId.make(randomId()),
      allocateCredentialIdSync: randomId,
      allocateRevisionSync: () => SecurityRevision.make(randomId()),
      commandRetentionMillis: 86_400_000,
      sessionInvalidation: "same-authority-immediate",
      identifier: {
        table: table("identifiers"),
        namespace: "namespace",
        value: "value",
        subjectId: "subjectId",
        verifiedAt: "verifiedAt",
        bindingRevision: "revision",
        isCurrent: (row) => row.active === true,
        encodeInitialInsert: (identifier, subjectId, revision) => ({
          ...identifier,
          subjectId,
          revision,
          verifiedAt: null,
          active: true,
        }),
      },
      credential: {
        ...mapped("passwords"),
        moduleId: "moduleId",
        subjectId: "subjectId",
        credentialId: "credentialId",
        credentialRevision: "credentialRevision",
        verifierVersion: "verifierVersion",
        verifier: "verifier",
        normalization: "normalization",
        encodeInsert: ({ replacement, ...row }) => ({ ...row, ...verifier(replacement) }),
        encodeVerifier: (hash, verifierVersion) => ({
          verifier: Redacted.value(hash),
          verifierVersion,
        }),
        encodeReplacement: ({ replacement, ...row }) => ({ ...row, ...verifier(replacement) }),
        decode: ({ moduleId, subject: row, identifier, credential }) =>
          Effect.gen(function* () {
            const id = yield* s.toSubject(row[s.id]);
            const hash = yield* decode(EncodedPasswordHash, credential.verifier);

            return yield* decode(PasswordCredentialSnapshot, {
              moduleId,
              revision: {
                subjectId: id,
                securityRevision: row[s.securityRevision],
                credentials: [
                  {
                    credentialId: credential.credentialId,
                    revision: credential.credentialRevision,
                  },
                ],
              },
              credentialId: credential.credentialId,
              credentialRevision: credential.credentialRevision,
              verifierVersion: credential.verifierVersion,
              verifier: hash,
              normalization: credential.normalization,
              identifier: yield* decode(LoginIdentifier, {
                namespace: identifier.namespace,
                value: identifier.value,
              }),
              identifierBindingRevision: identifier.revision,
              ...(identifier.verifiedAt === null
                ? {}
                : { identifierVerifiedAtMillis: yield* readInstant(identifier.verifiedAt) }),
            });
          }),
      },
      attempt: {
        ...mapped("passwordAttempts"),
        moduleId: "moduleId",
        action: "action",
        attemptId: "attemptId",
        identifierNamespace: "identifierNamespace",
        identifierValue: "identifierValue",
        subjectId: "subjectId",
        credentialId: "credentialId",
        securityRevision: "securityRevision",
        credentialRevision: "credentialRevision",
        verifierVersion: "verifierVersion",
        identifierBindingRevision: "identifierBindingRevision",
        admittedAt: "admittedAt",
        deadline: "deadline",
        retentionUntil: "retentionUntil",
        state: "state",
        encodeInsert: (row, { nativeSubjectId, state }) => ({
          moduleId: row.moduleId,
          action: row.action,
          attemptId: row.attemptId,
          identifierNamespace: row.identifier.namespace,
          identifierValue: row.identifier.value,
          subjectId: nativeSubjectId ?? null,
          credentialId: row.credentialId ?? null,
          securityRevision: row.securityRevision ?? null,
          credentialRevision: row.credentialRevision ?? null,
          verifierVersion: row.verifierVersion ?? null,
          identifierBindingRevision: row.identifierBindingRevision ?? null,
          admittedAt: instant(row.admittedAtMillis),
          deadline: instant(row.deadlineMillis),
          retentionUntil: instant(row.retentionUntilMillis),
          state,
        }),
      },
      rateScope: {
        ...mapped("passwordScopes"),
        moduleId: "moduleId",
        action: "action",
        scopeKind: "scopeKind",
        scopeKey: "scopeKey",
        encodeInsert: (row) => ({ ...row }),
      },
      charge: {
        ...mapped("passwordCharges"),
        moduleId: "moduleId",
        action: "action",
        scopeKind: "scopeKind",
        scopeKey: "scopeKey",
        attemptId: "attemptId",
        occurredAt: "occurredAt",
        retentionUntil: "retentionUntil",
        encodeInsert: (row) => ({
          ...row,
          occurredAt: instant(row.occurredAtMillis),
          retentionUntil: instant(row.retentionUntilMillis),
        }),
      },
      command: {
        ...mapped("passwordCommands"),
        moduleId: "moduleId",
        commandId: "commandId",
        action: "action",
        bindingDigest: "bindingDigest",
        decision: "decision",
        retentionUntil: "retentionUntil",
        encodeInsert: (row) => ({ ...row, retentionUntil: instant(row.retentionUntilMillis) }),
      },
    };
  };

  const emails = (): AnyEmailAddressMapping<SqlFragment> => ({
    subjectId,
    subject,
    constraints: requiredEmailAddressConstraints,
    addressCardinality: "single",
    changeDisposition: "retire-source",
    encodeInstant: instant,
    decodeInstant: readInstant,
    allocateCredentialIdSync: randomId,
    allocateRevisionSync: () => SecurityRevision.make(randomId()),
    commandRetentionMillis: 86_400_000,
    sessionInvalidation: "same-authority-immediate",
    isCommandConflict: () => false,
    isIdentifierConflict: () => false,
    isCredentialConflict: () => false,
    authorityCredential: {
      ...authorityCredential(),
      encodeActivation: (revision) => ({ revision, active: true }),
      encodeRetirement: (revision) => ({ revision, active: false }),
    },
    identifier: {
      table: table("identifiers"),
      namespace: "namespace",
      value: "value",
      subjectId: "subjectId",
      verifiedAt: "verifiedAt",
      bindingRevision: "revision",
      isCurrent: (row) => row.active === true && row.verifiedAt !== null,
      isMutableTarget: (row) => row.active === true && row.verifiedAt === null,
      encodeVerifiedInsert: ({ identifier, subjectId, verifiedAtMillis, bindingRevision }) => ({
        ...identifier,
        subjectId,
        verifiedAt: instant(verifiedAtMillis),
        revision: bindingRevision,
        active: true,
      }),
      encodeVerification: ({ verifiedAtMillis, bindingRevision }) => ({
        verifiedAt: instant(verifiedAtMillis),
        revision: bindingRevision,
        active: true,
      }),
      encodeRetirement: ({ bindingRevision }) => ({ revision: bindingRevision, active: false }),
    },
    credential: {
      table: table("emailCredentials"),
      moduleId: "moduleId",
      subjectId: "subjectId",
      credentialId: "credentialId",
      identifierNamespace: "identifierNamespace",
      identifierValue: "identifierValue",
      credentialRevision: "credentialRevision",
      status: "active",
      isActiveStatus: (value) => value === true,
      encodeVerifiedInsert: ({ identifier, ...row }) => ({
        ...row,
        identifierNamespace: identifier.namespace,
        identifierValue: identifier.value,
        active: true,
      }),
      encodeActivation: ({ identifier, credentialRevision }) => ({
        identifierNamespace: identifier.namespace,
        identifierValue: identifier.value,
        credentialRevision,
        active: true,
      }),
      encodeRetirement: ({ credentialRevision }) => ({ credentialRevision, active: false }),
      decode: ({ moduleId, subject: row, identifier, credential }) =>
        Effect.gen(function* () {
          return yield* decode(EmailCredentialSnapshot, {
            moduleId,
            identifier: { namespace: identifier.namespace, value: identifier.value },
            identifierRevision: identifier.revision,
            verifiedAtMillis: yield* readInstant(identifier.verifiedAt),
            credentialId: credential.credentialId,
            credentialRevision: credential.credentialRevision,
            revision: {
              subjectId: yield* s.toSubject(row[s.id]),
              securityRevision: row[s.securityRevision],
              credentials: [
                { credentialId: credential.credentialId, revision: credential.credentialRevision },
              ],
            },
          });
        }),
    },
    command: {
      table: table("emailCommands"),
      moduleId: "moduleId",
      commandId: "commandId",
      action: "action",
      bindingDigest: "bindingDigest",
      retentionUntil: "retentionUntil",
      encodeInsert: ({ retentionUntilMillis, ...row }) => ({
        ...row,
        retentionUntil: instant(retentionUntilMillis),
      }),
    },
  });

  const sessions = <C extends Schema.Codec<unknown, unknown, never, never>>(
    claims: C,
  ): StatefulSessionMapping<
    C["Type"],
    TableModel,
    TableModel,
    TableModel,
    TableModel,
    TableModel,
    unknown,
    string
  > => {
    const record = Schema.fromJsonString(
      Schema.Struct({
        ...SessionMetadata.fields,
        claims: Schema.Unknown,
        digest: TokenDigest,
        version: SecurityRevision,
        provenance: SessionAuthenticationProvenance,
        credentialVersion: SessionCredentialVersion,
      }),
    );

    const encodeRow = (value: StatefulSessionRecord<C["Type"]>) => ({
      digest: value.digest,
      version: value.version,
      securityRevision: value.securityRevision,
      issuedAt: instant(DateTime.toEpochMillis(value.issuedAt)),
      expiresAt: instant(DateTime.toEpochMillis(value.expiresAt)),
      absoluteExpiresAt: instant(DateTime.toEpochMillis(value.absoluteExpiresAt)),
      record: Schema.encodeSync(record)({
        ...value,
        claims: Schema.encodeSync(claims)(value.claims),
      }),
    });

    return {
      ...authority(),
      isConstraintConflict: () => false,
      constraints: { sessionDigest: "unique(session.digest)", flowId: "unique(flow.flowId)" },
      sessionId: {
        toNative: (id) => Effect.succeed(id),
        toSession: (id) => decode(SessionId, id),
        equals: Object.is,
      },
      flow: {
        table: table("sessionFlows"),
        flowId: "flowId",
        subjectId: "subjectId",
        state: "state",
        pendingDigest: "pendingDigest",
        dedupUntil: "dedupUntil",
        pendingStateValue: "pending",
        establishedStateValue: "established",
        encodeInstant: (date) => instant(DateTime.toEpochMillis(date)),
        decodeInstant: (value) => readInstant(value).pipe(Effect.map(DateTime.makeUnsafe)),
        encodePendingInsert: (row) => ({
          flowId: row.evidence.flowId,
          subjectId: row.subjectId,
          state: "pending",
          pendingDigest: row.pendingDigest,
          dedupUntil: instant(DateTime.toEpochMillis(row.dedupUntil)),
        }),
        encodeEstablishedInsert: (row) => ({
          flowId: row.evidence.flowId,
          subjectId: row.subjectId,
          state: "established",
          pendingDigest: null,
          dedupUntil: instant(DateTime.toEpochMillis(row.dedupUntil)),
        }),
      },
      session: {
        table: table("sessions"),
        sessionId: "sessionId",
        subjectId: "subjectId",
        digest: "digest",
        version: "version",
        securityRevision: "securityRevision",
        issuedAt: "issuedAt",
        expiresAt: "expiresAt",
        absoluteExpiresAt: "absoluteExpiresAt",
        encodeInstant: (date) => instant(DateTime.toEpochMillis(date)),
        allocateIdSync: randomId,
        allocateVersionSync: () => SecurityRevision.make(randomId()),
        encodeInsert: (value, ids) => ({ ...encodeRow(value), ...ids }),
        encodeRotation: encodeRow,
        decode: (row) =>
          Effect.gen(function* () {
            const saved = yield* decode(record, row.record);
            const decodedClaims = yield* decode(claims, saved.claims);

            return { ...saved, claims: decodedClaims };
          }),
      },
    };
  };

  return { table, authority, proofs, passwords, emails, sessions, string };
};
