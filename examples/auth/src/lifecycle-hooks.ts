import { BunRuntime } from "@effect/platform-bun";
import { Hooks, Identity, Operations, Schema as AuthSchema } from "@yielded/auth";
import { DateTime, Effect, Layer, Redacted, Schema, Semaphore } from "effect";
import { HttpRouter } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";

import {
  ExternalProofRejected,
  ExternalProofVerifier,
  ExternalRegistration,
  externalMethodContributions,
  externalMethodLayer,
  RegistrationAuthority,
  RegistrationTransaction,
} from "./external-method";

const registrationGate = Hooks.hookContribution("example/registration-gate");
const notification = Hooks.hookContribution("example/registration-notification");

const consumer = Hooks.pluginContributions({
  id: "example/consumer",
  operations: [],
  hooks: [registrationGate, notification],
  routes: [],
});

const composition = Hooks.composePlugins(externalMethodContributions, consumer);

const gates = registrationGate.layer({
  before: (snapshot) =>
    snapshot.action === "registration" &&
    snapshot.identifiers.some((identifier) => identifier.value.endsWith("@blocked.example"))
      ? Effect.fail(Hooks.HookDenied.make({ reason: "policy" }))
      : Effect.void,
});

const notifications = notification.layer({
  after: (event) =>
    Effect.log({
      notification: "registration committed",
      eventId: event.id,
      subjectId: event.snapshot.subjectId,
    }),
});

const hooks = composition.hooks.pipe(Layer.provide(Layer.mergeAll(gates, notifications)));

/** A small in-memory authoritative store: the semaphore and copy/swap own its actual commit. */
const authority = Layer.effect(
  RegistrationAuthority,
  Effect.sync(() => {
    let identities = new Map<string, AuthSchema.SubjectId>();
    let onboarding = new Set<AuthSchema.SubjectId>();
    const lock = Semaphore.makeUnsafe(1);

    return RegistrationAuthority.of({
      transaction: <A, E, R>(work: Effect.Effect<A, E, R>) =>
        lock.withPermits(1)(
          Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const nextIdentities = new Map(identities);
              const nextOnboarding = new Set(onboarding);

              const value = yield* restore(
                Effect.provideService(work, RegistrationTransaction, {
                  register: (identifier) => {
                    const key = `${identifier.namespace}:${identifier.value}`;

                    const subjectId =
                      nextIdentities.get(key) ??
                      AuthSchema.SubjectId.make(`partner/${nextIdentities.size + 1}`);

                    nextIdentities.set(key, subjectId);

                    return subjectId;
                  },
                  recordOnboarding: (subjectId) => {
                    nextOnboarding.add(subjectId);
                  },
                }),
              );

              identities = nextIdentities;
              onboarding = nextOnboarding;

              return value;
            }),
          ),
        ),
    });
  }),
);

/** Fixture-only verifier; a real consumer validates signed/one-time provider proofs. */
const verifier = Layer.succeed(ExternalProofVerifier, {
  verify: (proof) => {
    const identifier =
      Redacted.value(proof) === "fixture-proof"
        ? Identity.LoginIdentifier.make({ namespace: "email", value: "reader@example.com" })
        : Redacted.value(proof) === "fixture-blocked-proof"
          ? Identity.LoginIdentifier.make({ namespace: "email", value: "reader@blocked.example" })
          : undefined;

    return identifier === undefined
      ? Effect.fail(ExternalProofRejected.make({}))
      : Effect.succeed(identifier);
  },
});

const onboarding = Hooks.interactiveContribution(
  "example/onboarding",
  Effect.fn("RegistrationOnboarding.record")(function* (snapshot) {
    const transaction = yield* RegistrationTransaction;

    if (snapshot.subjectId !== undefined) transaction.recordOnboarding(snapshot.subjectId);
  }),
);

const method = externalMethodLayer([onboarding]).pipe(
  Layer.provide(Layer.mergeAll(authority, verifier, hooks)),
);

const group = Operations.remoteGroup([ExternalRegistration]);

const rpc = group
  .toLayer({
    "example.external.register": ExternalRegistration.rpcHandler(() =>
      Effect.succeed(Operations.guest),
    ),
  })
  .pipe(Layer.provide(method));

const http = RpcServer.layerHttp({ group, path: "/auth", protocol: "http" }).pipe(
  Layer.provide(rpc),
  Layer.provide(RpcSerialization.layerJson),
);

const program = Effect.gen(function* () {
  const local = yield* ExternalRegistration.invoke(Operations.guest, {
    proof: Redacted.make("fixture-proof"),
  }).pipe(Effect.provide(method));

  const denied = yield* ExternalRegistration.invoke(Operations.guest, {
    proof: Redacted.make("fixture-blocked-proof"),
  }).pipe(Effect.provide(method), Effect.result);

  yield* Effect.log({ local, denied });

  const server = yield* Effect.acquireRelease(
    Effect.sync(() => HttpRouter.toWebHandler(http, { disableLogger: true })),
    (server) => Effect.promise(() => server.dispose()),
  );

  const payload = yield* Schema.encodeEffect(
    Schema.toCodecJson(ExternalRegistration.rpc.payloadSchema),
  )({
    proof: Redacted.make("fixture-proof"),
  });

  const response = yield* Effect.promise(() =>
    server.handler(
      new Request("http://example.local/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // oxlint-disable-next-line no-restricted-properties -- Effect RPC's external transport envelope.
        body: JSON.stringify({
          _tag: "Request",
          id: "1",
          tag: ExternalRegistration.rpc._tag,
          payload,
          headers: [],
        }),
      }),
    ),
  );

  const remote = yield* Effect.promise(() => response.text());
  const completedAt = yield* DateTime.now;

  yield* Effect.log({ remote, completedAt });
}).pipe(Effect.scoped);

BunRuntime.runMain(program);
