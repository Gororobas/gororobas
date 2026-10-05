import { it } from "@effect/vitest";
import { Hooks, Proofs } from "@yielded/auth";
import { TokenDigest } from "@yielded/auth/Schema";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { expect } from "vite-plus/test";

import { makeD1ProofPersistenceServices } from "../src/drizzle/d1-proofs";
import { d1Database, d1Mapping } from "./fixtures/proof-sqlite";

// User-requested independent D1 regression: execute the production planner and
// atomic batch SQL, including a competing write between planning and commit.
const policy: Proofs.ProofPolicy = {
  ...Proofs.defaultProofPolicy,
  abuse: {
    ...Proofs.defaultProofPolicy.abuse,
    resendCooldownMillis: 0,
    issues: { limit: 2, windowMillis: 3_600_000 },
    actionIssues: { limit: 2, windowMillis: 3_600_000 },
  },
};

const record = (id: string, flowId: string): Proofs.ProofRecord => ({
  moduleId: "d1-proof-regression",
  purpose: Proofs.ProofPurpose.make("registration"),
  proofId: Proofs.ProofId.make(`${id}-proof`),
  requestId: Proofs.ProofRequestId.make(id),
  fingerprint: TokenDigest.make(`${id}:${flowId}`),
  deliveryId: Proofs.ProofDeliveryId.make(`${id}-delivery`),
  binding: Proofs.IdentifierProofBinding.make({
    flowId,
    contextDigest: TokenDigest.make(`${flowId}-private-binding`),
    identifier: { namespace: "email", value: "new@example.invalid" },
  }),
  verifier: { keyId: "test", digest: TokenDigest.make(`${id}-secret-digest`) },
  issuedAtMillis: 0,
  expiresAtMillis: policy.lifetimeMillis,
  version: Proofs.ProofVersion.make(id),
});

const issue = Effect.fnUntraced(function* (
  value: Proofs.ProofRecord,
  options: { readonly eligible?: boolean; readonly supersedes?: Proofs.ProofId } = {},
) {
  const { proofPersistence } = yield* makeD1ProofPersistenceServices(d1Mapping);

  const prepared = yield* proofPersistence.issue(
    {
      record: value,
      policy,
      eligible: options.eligible ?? true,
      ...(options.supersedes === undefined ? {} : { supersedes: options.supersedes }),
    },
    (decision, journal) => journal.prepare(decision),
  );

  return yield* Proofs.readProofCommit(prepared);
});

it.effect("D1 protects the current binding without charging suppressed requests", () =>
  Effect.gen(function* () {
    const original = record("victim", "victim");

    expect((yield* issue(original))._tag).toBe("Issued");
    expect(
      (yield* issue(record("attacker", "attacker"), { supersedes: original.proofId }))._tag,
    ).toBe("Suppressed");
    expect((yield* issue(record("ineligible", "victim"), { eligible: false }))._tag).toBe(
      "Suppressed",
    );
    expect((yield* issue(record("resend", "victim")))._tag).toBe("Issued");
    const sql = yield* SqlClient.SqlClient;

    const generations =
      yield* sql`select proof_id from proof_test_proofGenerations where state = 'active'`;

    expect(generations).toEqual([{ proof_id: "resend-proof" }]);

    const receipts =
      yield* sql`select request_id from proof_test_proofRequests order by request_id`;

    expect(receipts).toHaveLength(4);
  }).pipe(Effect.provide([d1Database(), Hooks.LifecycleHooks.empty])),
);

it.effect("D1 rolls back issuance when the current proof is cancelled before batch commit", () => {
  let interfere = false;

  const beforeBatch = Effect.gen(function* () {
    if (!interfere) return;
    interfere = false;
    const sql = yield* SqlClient.SqlClient;

    // Another owner has committed the cancellation transition.
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`update proof_test_proofGenerations set state = 'cancelled' where state = 'active'`;
        yield* sql`update proof_test_proofSeries set active_proof_id = null`;
      }),
    );
  });

  return Effect.gen(function* () {
    const original = record("victim", "victim");

    yield* issue(original);
    interfere = true;
    const raced = yield* issue(record("raced", "victim")).pipe(Effect.result);

    expect(raced._tag).toBe("Failure");
    const sql = yield* SqlClient.SqlClient;

    expect(yield* sql`select request_id from proof_test_proofRequests`).toEqual([
      { request_id: "victim" },
    ]);
    expect(yield* sql`select proof_id, state from proof_test_proofGenerations`).toEqual([
      { proof_id: "victim-proof", state: "cancelled" },
    ]);
  }).pipe(Effect.provide([d1Database(beforeBatch), Hooks.LifecycleHooks.empty]));
});
