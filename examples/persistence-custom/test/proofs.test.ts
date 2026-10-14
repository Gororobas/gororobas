import * as BunFileSystem from "@effect/platform-bun/BunFileSystem";
import * as BunPath from "@effect/platform-bun/BunPath";
import { Hooks, Proofs, Schema as AuthSchema, Sessions } from "@yielded/auth";
import { ConfigProvider, Effect, FileSystem, Layer } from "effect";
import { TestClock } from "effect/testing";
import { expect, it } from "vite-plus/test";

import { AppAuth } from "../src/auth";
import { Customer } from "../src/model";
import { ProofsLive } from "../src/proofs";
import { AccountStore } from "../src/store";

// Human-requested regressions for the shipped custom adapter: protect live
// bindings against replacement by another private request.
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
  } = {},
) {
  const policy = options.policy ?? Proofs.defaultProofPolicy;

  const record: Proofs.ProofIssueRecord = {
    moduleId: `${AppAuth.strategies.password.persistence.moduleId}/reset`,
    purpose: Proofs.ProofPurpose.make("password-reset"),
    proofId: Proofs.ProofId.make(`${requestId}-proof`),
    binding: bound,
    verifier: { keyId: "test", digest: AuthSchema.TokenDigest.make(`${requestId}-verifier`) },
  };

  const prepared = yield* (yield* Proofs.ProofPersistence).issue(
    {
      record,
      lifetimeMillis: policy.lifetimeMillis,
      resendCooldownMillis: policy.abuse.resendCooldownMillis,
      eligible: options.eligible ?? true,
    },
    (decision, journal) => journal.prepare(decision),
  );

  return { record, decision: yield* Proofs.readProofCommit(prepared) };
});

const attempt = Effect.fnUntraced(function* (record: Proofs.ProofIssueRecord) {
  const prepared = yield* (yield* Proofs.ProofPersistence).redeem(
    {
      moduleId: record.moduleId,
      purpose: record.purpose,
      proofId: record.proofId,
      binding: record.binding,
      candidate: record.verifier,
      maximumFailedAttempts: Proofs.defaultProofPolicy.maximumFailedAttempts,
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

    expect(yield* attempt(victim.record)).toBe("redeemed");

    const next = yield* issue("after-consumption", binding("victim"));

    expect(next.decision._tag).toBe("Issued");
    yield* TestClock.adjust(Proofs.defaultProofPolicy.lifetimeMillis);
    expect(
      (yield* issue("after-expiry", binding("victim", "new-private-binding"))).decision._tag,
    ).toBe("Issued");
  }).pipe(Effect.provide(live), Effect.runPromise));
