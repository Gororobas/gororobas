import * as BunFileSystem from "@effect/platform-bun/BunFileSystem";
import * as BunPath from "@effect/platform-bun/BunPath";
import { Hooks, Proofs, Schema as AuthSchema, Sessions } from "@yielded/auth";
import { ConfigProvider, DateTime, Effect, FileSystem, Layer } from "effect";
import { TestClock } from "effect/testing";
import { expect, it } from "vite-plus/test";

import { AppAuth } from "../src/auth";
import { Customer } from "../src/model";
import { ProofsLive } from "../src/proofs";
import { AccountStore } from "../src/store";

// Human-requested regressions for the shipped custom adapter: protect live
// bindings and spend issuance capacity only on proofs that are actually issued.
const seeded = Layer.effectDiscard(
  Effect.gen(function* () {
    const store = yield* AccountStore;

    yield* store.transaction((state) =>
      Effect.sync(() => {
        state.customers = ["victim", "other"].map((name) =>
          Customer.make({
            id: AuthSchema.SubjectId.make(name),
            active: true,
            securityRevision: Sessions.SecurityRevision.make("1"),
            displayName: name,
            username: name,
            email: AuthSchema.Email.make(`${name}@example.invalid`),
            identifierRevision: Sessions.SecurityRevision.make("1"),
            verifiedAtMillis: 0,
          }),
        );
      }),
    );
  }),
).pipe(Layer.provideMerge(AccountStore.layer));

const live = Layer.unwrap(
  Effect.gen(function* () {
    const directory = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped();

    return ProofsLive.pipe(
      Layer.provide(seeded),
      Layer.provide(
        Layer.succeed(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromUnknown({ AUTH_DATA_DIR: directory }),
        ),
      ),
    );
  }),
).pipe(
  Layer.provide([BunFileSystem.layer, BunPath.layer, Hooks.LifecycleHooks.empty]),
  Layer.provideMerge(TestClock.layer()),
);

const binding = (name: string, contextDigest = "private-binding") =>
  Proofs.SubjectProofBinding.make({
    flowId: "same-public-flow",
    contextDigest: AuthSchema.TokenDigest.make(contextDigest),
    identifier: { namespace: "email", value: `${name}@example.invalid` },
    revision: {
      subjectId: AuthSchema.SubjectId.make(name),
      securityRevision: Sessions.SecurityRevision.make("1"),
      credentials: [],
    },
  });

const issue = Effect.fnUntraced(function* (
  requestId: string,
  bound: Proofs.ProofBinding,
  options: {
    readonly eligible?: boolean;
    readonly policy?: Proofs.ProofPolicy;
    readonly supersedes?: Proofs.ProofId;
  } = {},
) {
  const now = DateTime.toEpochMillis(yield* DateTime.now);
  const policy = options.policy ?? Proofs.defaultProofPolicy;

  const record: Proofs.ProofRecord = {
    moduleId: `${AppAuth.strategies.password.persistence.moduleId}/reset`,
    purpose: Proofs.ProofPurpose.make("password-reset"),
    proofId: Proofs.ProofId.make(`${requestId}-proof`),
    requestId: Proofs.ProofRequestId.make(requestId),
    fingerprint: AuthSchema.TokenDigest.make(`${requestId}:${bound.contextDigest}`),
    deliveryId: Proofs.ProofDeliveryId.make(`${requestId}-delivery`),
    binding: bound,
    verifier: { keyId: "test", digest: AuthSchema.TokenDigest.make(`${requestId}-verifier`) },
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
      continuationDigest: AuthSchema.TokenDigest.make(`${record.proofId}-continuation-digest`),
      nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
      policy: Proofs.defaultProofPolicy,
    },
    (decision, journal) => journal.prepare(decision),
  );

  return yield* Proofs.readProofCommit(prepared);
});

it("preserves a live proof against another private binding until consumption or expiry", () =>
  Effect.gen(function* () {
    const victim = yield* issue("first", binding("victim"));

    expect(victim.decision._tag).toBe("Issued");
    yield* TestClock.adjust(30_000);

    const unrelated = yield* issue("unrelated", binding("victim", "another-private-binding"));

    expect(unrelated.decision._tag).toBe("Suppressed");

    const forgedResend = yield* issue(
      "forged-resend",
      binding("victim", "another-private-binding"),
      {
        supersedes: victim.record.proofId,
      },
    );

    expect(forgedResend.decision._tag).toBe("Suppressed");
    expect((yield* attempt(victim.record))._tag).toBe("Accepted");

    const next = yield* issue("after-consumption", binding("victim"));

    expect(next.decision._tag).toBe("Issued");
    yield* TestClock.adjust(Proofs.defaultProofPolicy.lifetimeMillis);
    expect(
      (yield* issue("after-expiry", binding("victim", "new-private-binding"))).decision._tag,
    ).toBe("Issued");
  }).pipe(Effect.provide(live), Effect.runPromise));

it("retains suppressed receipts without spending the default issuance budget", () =>
  Effect.gen(function* () {
    expect((yield* issue("first", binding("victim"))).decision._tag).toBe("Issued");
    const cooldown = yield* issue("cooldown", binding("victim"));

    expect(cooldown.decision._tag).toBe("Suppressed");
    for (const requestId of ["cooldown-2", "cooldown-3", "cooldown-4"])
      expect((yield* issue(requestId, binding("victim"))).decision._tag).toBe("Suppressed");

    expect((yield* issue("cooldown", binding("victim"))).decision).toEqual({
      ...cooldown.decision,
      _tag: "Existing",
    });

    for (const requestId of ["second", "third", "fourth", "fifth"]) {
      yield* TestClock.adjust(30_000);
      expect((yield* issue(requestId, binding("victim"))).decision._tag).toBe("Issued");
    }
    yield* TestClock.adjust(30_000);
    expect((yield* issue("budget-exhausted", binding("victim"))).decision._tag).toBe("Suppressed");
  }).pipe(Effect.provide(live), Effect.runPromise));

it("leaves action capacity for other accounts when an identifier is denied or ineligible", () =>
  Effect.gen(function* () {
    const policy: Proofs.ProofPolicy = {
      ...Proofs.defaultProofPolicy,
      abuse: {
        ...Proofs.defaultProofPolicy.abuse,
        issues: { limit: 1, windowMillis: 3_600_000 },
        actionIssues: { limit: 2, windowMillis: 3_600_000 },
      },
    };

    const unknown = Proofs.IdentifierProofBinding.make({
      flowId: "unknown",
      contextDigest: AuthSchema.TokenDigest.make("unknown-private-binding"),
      identifier: { namespace: "email", value: "unknown@example.invalid" },
    });

    expect((yield* issue("unknown", unknown, { eligible: false, policy })).decision._tag).toBe(
      "Suppressed",
    );
    expect((yield* issue("first", binding("victim"), { policy })).decision._tag).toBe("Issued");
    yield* TestClock.adjust(30_000);
    expect((yield* issue("denied", binding("victim"), { policy })).decision._tag).toBe(
      "Suppressed",
    );
    expect((yield* issue("other", binding("other"), { policy })).decision._tag).toBe("Issued");
  }).pipe(Effect.provide(live), Effect.runPromise));
