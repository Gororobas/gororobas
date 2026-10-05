import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { it } from "@effect/vitest";
import { Auth, PhoneOtp, Proofs, Sessions } from "@yielded/auth";
import { SubjectId, TokenDigest } from "@yielded/auth/Schema";
import { DateTime, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { expect } from "vite-plus/test";

import { AuthPersistence } from "../src/index";

// User-requested security regression: real persistence must protect the current
// binding and charge delivery capacity only for accepted proof issuance.
const app = Auth.make("test/proof-issuance", {
  claims: Schema.Struct({}),
  strategies: { phone: PhoneOtp.make() },
  sessions: Sessions.stateful(),
});

const subjects = AuthPersistence.table({
  name: "subjects",
  columns: {
    id: { name: "id", type: "text" },
    active: { name: "active", type: "boolean" },
    revision: { name: "revision", type: "text" },
  },
  unique: [["id"]],
});

const persistence = AuthPersistence.make(app);

const storage = persistence.managed({
  prefix: "proof_test",
  subjects: {
    table: subjects,
    id: "id",
    status: "active",
    activeValue: true,
    securityRevision: "revision",
    idCodec: SubjectId,
    requirements: () =>
      Effect.succeed({
        alternatives: [
          {
            factors: ["possession"],
            minimumCredentials: 1,
            userVerified: false,
            phishingResistant: false,
          },
        ],
        maximumAgeMillis: 60_000,
      }),
  },
});

const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';

const database = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    for (const table of [subjects, ...Object.values(storage.schema)]) {
      const columns = Object.values(table.columns).map(
        ({ options }) =>
          `${quote(options.name)} ${options.type === "text" ? "text" : "integer"}${options.nullable ? "" : " not null"}`,
      );

      const unique = table.unique.map(
        (keys) =>
          `unique (${keys.map((key) => quote(table.columns[key].options.name)).join(", ")})`,
      );

      yield* sql.unsafe(
        `create table ${quote(table.name)} (${[...columns, ...unique].join(", ")})`,
      );
    }
    yield* sql`insert into subjects values ('victim', 1, '1')`;
    yield* sql`insert into proof_test_identifiers
      (namespace, value, subject_id, revision, verified_at, active)
      values ('email', 'victim@example.invalid', 'victim', '1', 0, 1)`;
  }),
).pipe(Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })));

const live = persistence.layer.pipe(
  Layer.provide(persistence.Config.layer(storage)),
  Layer.provideMerge(database),
);

const policy: Proofs.ProofPolicy = {
  ...Proofs.defaultProofPolicy,
  abuse: {
    ...Proofs.defaultProofPolicy.abuse,
    issues: { limit: 4, windowMillis: 3_600_000 },
    subjectIssues: { limit: 4, windowMillis: 3_600_000 },
    actionIssues: { limit: 4, windowMillis: 3_600_000 },
  },
};

const binding = (flowId: string): Proofs.ProofBinding =>
  Proofs.SubjectProofBinding.make({
    flowId,
    contextDigest: TokenDigest.make(`${flowId}-private-binding`),
    identifier: { namespace: "email", value: "victim@example.invalid" },
    revision: {
      subjectId: SubjectId.make("victim"),
      securityRevision: Sessions.SecurityRevision.make("1"),
      credentials: [],
    },
  });

const issue = Effect.fnUntraced(function* (
  requestId: string,
  bound: Proofs.ProofBinding,
  options: { readonly eligible?: boolean; readonly supersedes?: Proofs.ProofId } = {},
) {
  const now = DateTime.toEpochMillis(yield* DateTime.now);

  const record: Proofs.ProofRecord = {
    moduleId: "proof-regression",
    purpose: Proofs.ProofPurpose.make("sign-in"),
    proofId: Proofs.ProofId.make(`${requestId}-proof`),
    requestId: Proofs.ProofRequestId.make(requestId),
    fingerprint: TokenDigest.make(
      `${requestId}:${bound.contextDigest}:${options.supersedes ?? ""}`,
    ),
    deliveryId: Proofs.ProofDeliveryId.make(`${requestId}-delivery`),
    binding: bound,
    verifier: { keyId: "test", digest: TokenDigest.make(`${requestId}-secret-digest`) },
    issuedAtMillis: now,
    expiresAtMillis: now + policy.lifetimeMillis,
    version: Proofs.ProofVersion.make(requestId),
  };

  const prepared = yield* (yield* Proofs.ProofPersistence).issue(
    {
      record,
      policy,
      eligible: options.eligible ?? true,
      ...(options.supersedes === undefined ? {} : { supersedes: options.supersedes }),
    },
    (decision, journal) => journal.prepare(decision),
  );

  return { record, decision: yield* Proofs.readProofCommit(prepared) };
});

const attempt = Effect.fnUntraced(function* (record: Proofs.ProofRecord) {
  const prepared = yield* (yield* Proofs.ProofPersistence).attempt(
    {
      moduleId: record.moduleId,
      purpose: record.purpose,
      proofId: record.proofId,
      binding: record.binding,
      candidate: record.verifier,
      continuationId: Proofs.ProofContinuationId.make(`${record.proofId}-continuation`),
      continuationDigest: TokenDigest.make(`${record.proofId}-continuation-digest`),
      nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
      policy,
    },
    (decision, journal) => journal.prepare(decision),
  );

  return yield* Proofs.readProofCommit(prepared);
});

it.effect.each([false, true])(
  "a different binding cannot replace a live proof (known reference: %s)",
  (knownReference) =>
    Effect.gen(function* () {
      const victim = yield* issue("victim", binding("victim"));

      expect(victim.decision._tag).toBe("Issued");
      yield* TestClock.adjust(30_000);

      const unrelated = yield* issue(
        "unrelated",
        binding("attacker"),
        knownReference ? { supersedes: victim.record.proofId } : {},
      );

      expect(unrelated.decision._tag).toBe("Suppressed");
      expect((yield* attempt(victim.record))._tag).toBe("Accepted");
    }).pipe(Effect.provide(live)),
);

it.effect("suppressed requests retain receipts without spending issuance capacity", () =>
  Effect.gen(function* () {
    const original = yield* issue("first", binding("victim"));
    const cooldown = yield* issue("cooldown", binding("victim"));

    expect(cooldown.decision._tag).toBe("Suppressed");
    yield* TestClock.adjust(30_000);
    const ineligible = yield* issue("ineligible", binding("victim"), { eligible: false });

    const stale = yield* issue("stale", binding("victim"), {
      supersedes: Proofs.ProofId.make("unrelated-proof"),
    });

    expect(ineligible.decision._tag).toBe("Suppressed");
    expect(stale.decision._tag).toBe("Suppressed");

    const replay = yield* issue("cooldown", binding("victim"));

    expect(replay.decision).toEqual({
      _tag: "Existing",
      receipt: {
        requestId: cooldown.record.requestId,
        reference: {
          proofId: cooldown.record.proofId,
          purpose: cooldown.record.purpose,
          keyId: "test",
        },
      },
    });
    const conflicting = yield* issue("cooldown", binding("attacker")).pipe(Effect.result);

    expect(conflicting._tag).toBe("Failure");
    if (conflicting._tag === "Failure")
      expect(conflicting.failure._tag).toBe("ProofRequestConflict");

    const resent = yield* issue("resend", binding("victim"), {
      supersedes: original.record.proofId,
    });

    expect(resent.decision._tag).toBe("Issued");
    yield* TestClock.adjust(30_000);
    const implicitResend = yield* issue("implicit-resend", binding("victim"));

    expect(implicitResend.decision._tag).toBe("Issued");
    expect((yield* attempt(original.record))._tag).toBe("Rejected");
    expect((yield* attempt(implicitResend.record))._tag).toBe("Accepted");

    yield* TestClock.adjust(30_000);
    const replacement = yield* issue("after-consumption", binding("new-client"));

    expect(replacement.decision._tag).toBe("Issued");
    yield* TestClock.adjust(30_000);
    expect((yield* issue("budget-exhausted", binding("new-client"))).decision._tag).toBe(
      "Suppressed",
    );
  }).pipe(Effect.provide(live)),
);
