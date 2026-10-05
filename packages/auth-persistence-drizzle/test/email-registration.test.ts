import { it } from "@effect/vitest";
import { Auth, Email, Hooks, Proofs } from "@yielded/auth";
import { makeStorageMappings } from "@yielded/auth-persistence/Adapter";
import { TokenDigest } from "@yielded/auth/Schema";
import { getTableColumns, sql } from "drizzle-orm";
import { integer, sqliteTable, text, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { expect } from "vite-plus/test";

import * as D1 from "../src/D1";
import {
  type D1EmailRegistrationMapping,
  requiredEmailRegistrationConstraints,
} from "../src/drizzle/email-model";
import { PersistenceMappingError } from "../src/drizzle/model";
import * as Sqlite from "../src/SqliteNode";
import type { subjects } from "./fixtures/proof-sqlite";
import { database, d1Database, d1Mapping, storage } from "./fixtures/proof-sqlite";

// User-requested finding 3 regression: real proof issuance/attempt and public raw
// registration authority, including the independently compiled D1 atomic batch.
const Registration = Schema.Struct({ displayName: Schema.String });

const registrations = sqliteTable("email_registrations", {
  moduleId: text("module_id").notNull(),
  commandId: text("command_id").notNull(),
  fingerprint: text().notNull(),
  state: text().notNull(),
  subjectId: text("subject_id"),
  pendingReference: text("pending_reference"),
  retentionUntil: integer("retention_until").notNull(),
});

const moduleId = "mailbox";

const { RegistrationAuthority } = Auth.make("test/email-registration", {
  claims: Registration,
  strategies: {
    registration: Email.makeRegistration({ namespace: moduleId, registration: Registration }),
  },
}).strategies.registration;

const identifier = { namespace: "email", value: "owner@example.invalid" };
const fingerprint = TokenDigest.make("owner-registration");
const columns = getTableColumns(storage.schema.identifiers);
const email = makeStorageMappings(storage).emails();

const proofMapping: typeof d1Mapping = {
  ...d1Mapping,
  authority: {
    ...d1Mapping.authority,
    identifier: {
      ...d1Mapping.authority.identifier,
      isCurrent: (input, rows) =>
        input.purpose === "email-code-registration" &&
        input.binding._tag === "Identifier" &&
        (rows.length === 0 ||
          (rows.length === 1 && rows[0]!.active === true && rows[0]!.verifiedAt === null)),
      d1CurrentCondition: ({ binding, purpose }) =>
        purpose === "email-code-registration" && binding._tag === "Identifier"
          ? sql`not exists(
              select 1 from ${storage.schema.identifiers}
              where ${columns.namespace} = ${binding.identifier.namespace}
                and ${columns.value} = ${binding.identifier.value}
                and (${columns.active} <> 1 or ${columns.verifiedAt} is not null))`
          : sql`false`,
    },
  },
};

const mapping = {
  mode: "atomic",
  ...email,
  d1: d1Mapping.d1,
  subject: { ...email.subject, d1ActiveStatusValue: true },
  identifier: {
    ...email.identifier,
    d1CurrentCondition: (input: {
      identifier: { namespace: string; value: string };
      nativeSubjectId: string;
      bindingRevision: string;
    }) =>
      sql`${columns.namespace} = ${input.identifier.namespace} and ${columns.value} = ${input.identifier.value}
        and ${columns.subjectId} = ${input.nativeSubjectId} and ${columns.revision} = ${input.bindingRevision}
        and ${columns.active} = 1 and ${columns.verifiedAt} is not null`,
  },
  credential: { ...email.credential, d1ActiveStatusValue: true },
  authorityCredential: { ...email.authorityCredential, d1ActiveStatusValue: true },
  constraints: requiredEmailRegistrationConstraints,
  inspect: () => Effect.succeed({ fingerprint, eligible: true }),
  snapshotRegistration: (value: typeof Registration.Type) =>
    Schema.decodeUnknownEffect(Registration)(value).pipe(
      Effect.mapError((cause) => PersistenceMappingError.make({ operation: "mapping", cause })),
    ),
  retentionMillis: 3_600_000,
  isRequestConflict: () => false,
  isIdentifierConflict: (cause: unknown) =>
    cause instanceof Error &&
    cause.message.includes("UNIQUE constraint failed: proof_test_identifiers"),
  provisioning: {
    idMode: "synchronous",
    allocateSubjectIdSync: () => "mailbox-owner",
    encodeSubjectInsert: (
      _input: unknown,
      values: { nativeSubjectId: string; securityRevision: string },
    ) => ({
      id: values.nativeSubjectId,
      active: true,
      revision: values.securityRevision,
    }),
  },
  registration: {
    table: registrations,
    moduleId: "moduleId",
    commandId: "commandId",
    fingerprint: "fingerprint",
    state: "state",
    subjectId: "subjectId",
    pendingReference: "pendingReference",
    retentionUntil: "retentionUntil",
    encodeInsert: (
      input: { moduleId: string; commandId: string; fingerprint: string },
      value: {
        state: string;
        nativeSubjectId?: string;
        pendingReference?: string;
        retentionUntilMillis: number;
      },
    ) => ({
      moduleId: input.moduleId,
      commandId: input.commandId,
      fingerprint: input.fingerprint,
      state: value.state,
      subjectId: value.nativeSubjectId ?? null,
      pendingReference: value.pendingReference ?? null,
      retentionUntil: value.retentionUntilMillis,
    }),
    decodeReplay: () => Effect.succeed({ _tag: "Rejected" as const }),
  },
  // Production shared mappings erase table types; these are the same concrete
  // Drizzle tables. No persisted value crosses a schema through this adapter cast.
} as unknown as D1EmailRegistrationMapping<
  typeof Registration.Type,
  typeof subjects,
  SQLiteTable,
  SQLiteTable,
  SQLiteTable,
  typeof registrations,
  string
>;

const seed = Effect.gen(function* () {
  const client = yield* SqlClient.SqlClient;

  yield* client`create table email_registrations (
    module_id text not null, command_id text not null, fingerprint text not null,
    state text not null, subject_id text, pending_reference text unique, retention_until integer not null,
    unique(module_id, command_id))`;
  yield* client`create table application_data (subject_id text primary key, contents text not null)`;
  yield* client`insert into subjects values ('squatter', 1, 'old-security')`;
  yield* client`insert into application_data values ('squatter', 'attacker-owned data')`;
  yield* client`insert into proof_test_identifiers
    (namespace, value, subject_id, revision, verified_at, active)
    values ('email', 'owner@example.invalid', 'squatter', 'old-binding', null, 1)`;
  yield* client`insert into proof_test_credentials (credential_id, subject_id, revision, active)
    values ('attacker-password', 'squatter', 'old-password', 1)`;
  yield* client`insert into proof_test_passwords
    (module_id, subject_id, credential_id, credential_revision, verifier_version, verifier, normalization)
    values ('password', 'squatter', 'attacker-password', 'old-password', 'old-verifier', 'opaque-attacker-verifier', 'none')`;
});

const services = (mode: "interactive" | "d1") =>
  mode === "d1"
    ? Effect.all({
        registration: D1.makeEmailRegistrationServices(mapping, proofMapping),
        proofs: D1.makeProofPersistenceServices(proofMapping),
      })
    : Effect.all({
        registration: Sqlite.makeEmailRegistrationServices(mapping, proofMapping),
        proofs: Sqlite.makeProofPersistenceServices(proofMapping),
      });

const continuation = Effect.gen(function* () {
  const store = yield* Proofs.ProofPersistence;

  const record: Proofs.ProofRecord = {
    moduleId: `${moduleId}/registration`,
    purpose: Proofs.ProofPurpose.make("email-code-registration"),
    proofId: Proofs.ProofId.make("mailbox-proof"),
    requestId: Proofs.ProofRequestId.make("mailbox-request"),
    fingerprint,
    deliveryId: Proofs.ProofDeliveryId.make("mailbox-delivery"),
    binding: Proofs.IdentifierProofBinding.make({
      identifier,
      flowId: "registration-flow",
      contextDigest: TokenDigest.make("private-flow-binding"),
    }),
    verifier: { keyId: "key", digest: TokenDigest.make("correct-secret-digest") },
    issuedAtMillis: 0,
    expiresAtMillis: 300_000,
    version: Proofs.ProofVersion.make("proof-version"),
  };

  const issued = yield* store.issue(
    { record, eligible: true, policy: Proofs.defaultProofPolicy },
    (value, journal) => journal.prepare(value),
  );

  expect((yield* issued.read)._tag).toBe("Issued");

  const input: Proofs.ProofCompletionPlan["input"] = {
    moduleId: record.moduleId,
    purpose: record.purpose,
    binding: record.binding,
    nowMillis: 0,
    continuationId: Proofs.ProofContinuationId.make("mailbox-continuation"),
    continuationDigest: TokenDigest.make("private-continuation"),
  };

  const attempted = yield* store.attempt(
    {
      ...input,
      proofId: record.proofId,
      candidate: record.verifier,
      nowMillis: 0,
      policy: Proofs.defaultProofPolicy,
    },
    (value, journal) => journal.prepare(value),
  );

  expect((yield* attempted.read)._tag).toBe("Accepted");

  return {
    input,
    prepare: (decision, journal, project) => journal.prepare(project(decision)),
  } satisfies Proofs.ProofCompletionPlan;
});

const complete = Effect.fnUntraced(function* (completion: Proofs.ProofCompletionPlan) {
  const authority = yield* RegistrationAuthority;

  const prepared = yield* authority.registerWithProof(
    {
      moduleId,
      commandId: Email.EmailCommandId.make("register-owner"),
      identifier,
      registration: { displayName: "Mailbox owner" },
      fingerprint,
      completion,
    },
    (value, journal) => journal.prepare(value),
  );

  return yield* prepared.read;
});

const state = Effect.gen(function* () {
  const client = yield* SqlClient.SqlClient;

  return {
    subjects: yield* client`select * from subjects order by id`,
    identifier: yield* client`select * from proof_test_identifiers`,
    passwords: yield* client`select * from proof_test_passwords`,
    data: yield* client`select * from application_data`,
    credentials: yield* client`select * from proof_test_credentials order by credential_id`,
    email: yield* client`select * from proof_test_emailCredentials`,
    receipts: yield* client`select * from email_registrations`,
    continuations: yield* client`select consumed from proof_test_proofContinuations`,
  };
});

const layers = (mode: "interactive" | "d1", beforeBatch?: Parameters<typeof d1Database>[0]) =>
  Layer.effectContext(
    Effect.gen(function* () {
      yield* seed;
      const { registration, proofs } = yield* services(mode);

      return Context.make(RegistrationAuthority, registration.registrationAuthority).pipe(
        Context.add(Proofs.ProofPersistence, proofs.proofPersistence),
      );
    }),
  ).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Sqlite.databaseLayer.pipe(Layer.provideMerge(database)),
        d1Database(beforeBatch),
        Hooks.LifecycleHooks.empty,
      ),
    ),
  );

it.effect.each([
  { mode: "interactive", disabled: false },
  { mode: "d1", disabled: false },
  { mode: "interactive", disabled: true },
  { mode: "d1", disabled: true },
] as const)(
  "$mode mailbox registration replaces only the unverified binding (disabled prior subject: $disabled)",
  ({ mode, disabled }) =>
    Effect.gen(function* () {
      if (disabled) {
        const client = yield* SqlClient.SqlClient;

        yield* client`update subjects set active = 0 where id = 'squatter'`;
      }
      const completion = yield* continuation;
      const before = yield* state;

      expect((yield* complete(completion))._tag).toBe("Registered");
      const after = yield* state;

      expect(after.identifier[0]).toMatchObject({
        subject_id: "mailbox-owner",
        verified_at: 0,
        active: 1,
      });
      expect(after.identifier[0]!.revision).not.toBe("old-binding");
      expect(after.subjects.find((row) => row.id === "squatter")!.revision).not.toBe(
        "old-security",
      );
      expect(after.subjects.find((row) => row.id === "squatter")!.active).toBe(disabled ? 0 : 1);
      expect(after.subjects.map((row) => row.id)).toEqual(["mailbox-owner", "squatter"]);
      expect(after.data).toEqual(before.data);
      expect(after.passwords).toEqual(before.passwords);
      expect(after.credentials).toContainEqual(before.credentials[0]);
      expect(after.email).toHaveLength(1);
      expect(after.email[0]!.subject_id).toBe("mailbox-owner");
      expect(after.receipts).toHaveLength(1);
      expect(after.continuations).toEqual([{ consumed: 1 }]);
      expect((yield* complete(completion))._tag).toBe("Rejected");
      expect(yield* state).toEqual(after);
    }).pipe(Effect.provide(layers(mode))),
);

it.effect.each(["interactive", "d1"] as const)(
  "%s protected-write failure preserves the old subject and usable proof",
  (mode) =>
    Effect.gen(function* () {
      const completion = yield* continuation;
      const before = yield* state;
      const client = yield* SqlClient.SqlClient;

      yield* client`create trigger reject_email before insert on proof_test_emailCredentials begin select raise(abort, 'protected-write failure'); end`;
      expect((yield* complete(completion).pipe(Effect.result))._tag).toBe("Failure");
      expect(yield* state).toEqual(before);
      yield* client`drop trigger reject_email`;
      expect((yield* complete(completion))._tag).toBe("Registered");
    }).pipe(Effect.provide(layers(mode))),
);

it.effect("D1 rejects a verified binding committed after registration planning", () => {
  let interfere = false;

  const beforeBatch = Effect.gen(function* () {
    if (!interfere) return;
    interfere = false;
    const client = yield* SqlClient.SqlClient;

    yield* client`update proof_test_identifiers set verified_at = 1, revision = 'verified-binding'`;
  });

  return Effect.gen(function* () {
    const completion = yield* continuation;

    interfere = true;

    const result = yield* complete(completion).pipe(Effect.result);

    expect(result._tag === "Failure" || result.success._tag === "Rejected").toBe(true);
    const saved = yield* state;

    expect(saved.subjects).toEqual([{ id: "squatter", active: 1, revision: "old-security" }]);
    expect(saved.identifier[0]).toMatchObject({
      subject_id: "squatter",
      verified_at: 1,
      revision: "verified-binding",
    });
    expect(saved.email).toEqual([]);
    expect(saved.receipts).toEqual([]);
    expect(saved.continuations).toEqual([{ consumed: 0 }]);
  }).pipe(Effect.provide(layers("d1", beforeBatch)));
});
