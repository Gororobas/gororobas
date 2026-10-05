import { SqliteClient } from "@effect/sql-sqlite-node";
import { it } from "@effect/vitest";
import { Auth, Hooks, Passkey, Sessions, WebCrypto } from "@yielded/auth";
import * as Native from "@yielded/auth-persistence-drizzle/SqliteNode";
import { AuthenticationAssurance } from "@yielded/auth/Operations";
import { SubjectId } from "@yielded/auth/Schema";
import { sql as drizzleSql } from "drizzle-orm";
import { Array, DateTime, Deferred, Effect, Fiber, Layer, Logger, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { expect } from "vite-plus/test";

import * as Tables from "../src/passkey-sqlite-schema";

const claims = Schema.Struct({});
const sessions = Sessions.make(claims);
const management = { ...Tables.management, requireImmediateInvalidation: false };

const module = Passkey.makeManagement({ policy: Tables.policy, management }).bind({
  namespace: Tables.base.moduleId,
  sessionNamespace: sessions.moduleId,
  sessions,
  claims,
});

const keys = {
  activeKeyId: "test",
  keys: [{ id: "test", material: Redacted.make("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") }],
};

const verified = Passkey.PasskeyRegistrationVerified.make({
  protocolCredentialId: Passkey.PasskeyProtocolCredentialId.make("AQ"),
  publicKey: "AQ",
  algorithm: -7,
  userVerified: true,
  backupEligible: true,
  backupState: true,
  counter: 0,
});

const invalidClaimId = Base64Url.encode(new Uint8Array(32).fill(2));

const harness = (
  options: {
    verify?: (
      input: Parameters<Passkey.PasskeyProtocol["Service"]["verifyRegistration"]>[0],
    ) => Effect.Effect<
      Passkey.PasskeyRegistrationVerified,
      Passkey.PasskeyProtocolRejected | Passkey.PasskeyUnavailable,
      SqlClient.SqlClient
    >;
    invalidClaim?: boolean;
  } = {},
) => {
  const database = Layer.effectDiscard(
    Effect.gen(function* () {
      yield* Tables.migrate;
      const sql = yield* SqlClient.SqlClient;

      yield* sql`CREATE TABLE passkey_test_clock (millis INTEGER NOT NULL)`;
      yield* sql`INSERT INTO passkey_test_clock VALUES (${DateTime.toEpochMillis(yield* DateTime.now)})`;
      yield* sql`INSERT INTO passkey_subject VALUES ('account', 'active', '1', 'Example')`;
      yield* sql`INSERT INTO passkey_factor VALUES ('account', 'existing-factor', '1', 'active')`;
    }),
  ).pipe(Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })));

  const storage = Layer.unwrap(
    Effect.gen(function* () {
      const services = yield* Native.makePasskeyManagementServices({
        ...Tables.managementMapping,
        clock: {
          ...Tables.base.clock,
          engineNowMillis: drizzleSql`(SELECT millis FROM passkey_test_clock)`,
        },
        write: {
          ...Tables.write,
          policy: { ...Tables.write.policy, management: () => management },
        },
      });

      const enrollment = yield* Native.makePasskeyEnrollmentContextServices({
        moduleId: Tables.base.moduleId,
        read: Tables.read,
        module: Tables.base.module,
      });

      const persistence = options.invalidClaim
        ? Passkey.PasskeyPersistence.of({
            ...services.passkeyPersistence,
            claim: (input, prepare) =>
              services.passkeyPersistence.claim(input, (decision, journal) =>
                prepare(
                  decision._tag === "Claimed"
                    ? {
                        ...decision,
                        claim: { ...decision.claim, claimId: invalidClaimId },
                      }
                    : decision,
                  journal,
                ),
              ),
          })
        : services.passkeyPersistence;

      return Layer.mergeAll(
        Layer.succeed(Passkey.PasskeyPersistence, persistence),
        Layer.succeed(Passkey.PasskeyManagementPersistence, services.passkeyManagementPersistence),
        Layer.succeed(Passkey.PasskeyEnrollmentContext, enrollment.passkeyEnrollmentContext),
      );
    }),
  ).pipe(Layer.provide(Native.databaseLayer), Layer.provideMerge(database));

  // Isolate independent clocks at the public workflow. The deployed reproducer
  // used a real synced ES256 virtual authenticator but failed before verification.
  const protocol = Layer.effect(
    Passkey.PasskeyProtocol,
    Effect.map(SqlClient.SqlClient, (sql) =>
      Passkey.PasskeyProtocol.of({
        prepareAuthentication: () => Effect.die("Not used by enrollment"),
        verifyAuthentication: () => Effect.die("Not used by enrollment"),
        prepareRegistration: ({
          profile,
          challenge,
          timeoutMillis,
          userHandle,
          name,
          displayName,
          excludedCredentials,
        }) =>
          Effect.succeed(
            Passkey.PasskeyRegistrationOptions.make({
              challenge,
              rp: { id: profile.rpId, name: profile.rpName },
              user: { id: userHandle, name, displayName },
              pubKeyCredParams: Array.map(profile.algorithms, (alg) => ({
                type: "public-key" as const,
                alg,
              })),
              timeout: timeoutMillis,
              attestation: "none",
              authenticatorSelection: { residentKey: "required", userVerification: "required" },
              excludeCredentials: excludedCredentials,
            }),
          ),
        verifyRegistration: (input) =>
          (options.verify?.(input) ?? Effect.succeed(verified)).pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
          ),
      }),
    ),
  );

  const action = Layer.succeed(Passkey.PasskeyActionEvidence, {
    verify: ({ challenge }) =>
      Effect.succeed({
        requirement: Tables.requirement,
        evidence: Passkey.PasskeyEvidence.make({
          revision: challenge.revision,
          flowId: Sessions.AuthenticationFlowId.make(challenge.flowId),
          bindingDigest: challenge.bindingDigest,
          proofs: [
            {
              method: "existing-factor",
              credentialId: "existing-factor",
              factors: ["possession"],
              userVerified: true,
              phishingResistant: true,
              verifiedAt: DateTime.makeUnsafe(0),
            },
          ],
        }),
      }),
  });

  return module.layer.pipe(
    Layer.provide(module.binding.layer),
    Layer.provide(
      sessions.statelessLayer(Sessions.stateless({ keys }).policy(sessions.moduleId), keys),
    ),
    Layer.provide([
      protocol,
      action,
      Auth.RequestBindingConfig.layer({ generation: 1, lifetimeMillis: 300000, keyring: keys }),
      Passkey.PasskeyConfig.layer({ profiles: [Tables.profile] }),
    ]),
    Layer.provideMerge(storage),
    Layer.provide([WebCrypto.layerWebCrypto, Hooks.LifecycleHooks.empty]),
  );
};

const start = Effect.gen(function* () {
  const service = yield* module.Management;

  const caller = {
    _tag: "Authenticated" as const,
    subjectId: SubjectId.make("account"),
    assurance: new AuthenticationAssurance({
      method: "existing-factor",
      factors: ["possession"],
      authenticatedAt: DateTime.makeUnsafe(0),
    }),
  };

  const started = yield* service.begin(caller, {
    flowId: Passkey.PasskeyBegin.fields.flowId.make("enrollment"),
    commandId: Passkey.PasskeyBegin.fields.commandId.make("enrollment"),
    profileId: Tables.profile.profileId,
    name: "Synced ES256",
  });

  const binding = started.credentialCommands.find((command) => command._tag === "Issue");

  if (binding?._tag !== "Issue") return yield* Effect.die("Missing request binding");

  return {
    service,
    caller,
    complete: service.complete(caller, {
      flowId: started.value.flowId,
      bindingCredential: binding.credential,
      response: Redacted.make("registration-response"),
    }),
  };
});

// Regression: https://github.com/yielded-dev/auth/commit/2ff581d
// Real remote SQL clocks cannot be synchronized reliably in deployed acceptance.
it.effect.each([
  { applicationMillis: 0, databaseMillis: 242 },
  { applicationMillis: 80000, databaseMillis: 10000 },
])(
  "enrolls and lists a synced passkey with independent clocks %#",
  ({ applicationMillis, databaseMillis }) =>
    Effect.gen(function* () {
      const started = yield* start;
      const sql = yield* SqlClient.SqlClient;

      yield* TestClock.adjust(applicationMillis);
      yield* sql`UPDATE passkey_test_clock SET millis = ${databaseMillis}`;
      const result = yield* started.complete;

      expect(result.value.credential.name).toBe("Synced ES256");
      expect((yield* started.service.list(started.caller, { limit: 10 })).credentials).toEqual([
        result.value.credential,
      ]);
      expect(
        yield* sql`SELECT algorithm, backupEligible, backupState FROM passkey_credential`,
      ).toEqual([{ algorithm: -7, backupEligible: 1, backupState: 1 }]);
      expect((yield* started.complete.pipe(Effect.flip))._tag).toBe("PasskeyRejected");
    }).pipe(Effect.provide(harness())),
);

it.effect("rejects enrollment when authority time expires the claim during verification", () =>
  Effect.gen(function* () {
    const started = yield* start;

    yield* (yield* SqlClient.SqlClient)`UPDATE passkey_test_clock SET millis = 242`;
    expect((yield* started.complete.pipe(Effect.flip))._tag).toBe("PasskeyRejected");
    expect((yield* started.service.list(started.caller, { limit: 10 })).credentials).toHaveLength(
      0,
    );
    expect((yield* started.complete.pipe(Effect.flip))._tag).toBe("PasskeyRejected");
  }).pipe(
    Effect.provide(
      harness({
        verify: () =>
          Effect.gen(function* () {
            yield* (yield* SqlClient.SqlClient)`UPDATE passkey_test_clock SET millis = 60242`;

            return verified;
          }).pipe(Effect.orDie),
      }),
    ),
  ),
);

it.effect("bounds a stalled verifier by the claim duration and terminalizes it once", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const closed = yield* Deferred.make<void>();

    yield* Effect.gen(function* () {
      const started = yield* start;

      yield* (yield* SqlClient.SqlClient)`UPDATE passkey_test_clock SET millis = 242`;
      const fiber = yield* started.complete.pipe(Effect.flip, Effect.forkChild);

      expect(
        yield* Effect.raceFirst(
          Deferred.await(entered).pipe(Effect.as("entered")),
          Fiber.await(fiber).pipe(Effect.as("finished")),
        ),
      ).toBe("entered");
      yield* TestClock.adjust(60000);
      expect((yield* Fiber.join(fiber))._tag).toBe("PasskeyUnavailable");
      expect(yield* Deferred.isDone(closed)).toBe(true);
      expect((yield* started.service.list(started.caller, { limit: 10 })).credentials).toHaveLength(
        0,
      );
      expect((yield* started.complete.pipe(Effect.flip))._tag).toBe("PasskeyRejected");
    }).pipe(
      Effect.provide(
        harness({
          verify: () =>
            Deferred.succeed(entered, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.ensuring(Deferred.succeed(closed, undefined)),
            ),
        }),
      ),
    );
  }),
);

it.effect("reports an invalid claim receipt once without leaking credential content", () => {
  const logs: string[] = [];

  const logger = Logger.make((entry) =>
    logs.push(JSON.stringify(Logger.formatStructured.log(entry))),
  );

  return Effect.gen(function* () {
    const started = yield* start;

    expect((yield* started.complete.pipe(Effect.flip))._tag).toBe("PasskeyUnavailable");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Auth passkey-core failed");
    expect(logs[0]).toContain("claimIdMatches");
    for (const privateValue of ["account", invalidClaimId, "registration-response", "Synced ES256"])
      expect(logs[0]).not.toContain(privateValue);
    expect((yield* started.service.list(started.caller, { limit: 10 })).credentials).toHaveLength(
      0,
    );
  }).pipe(Effect.provide([harness({ invalidClaim: true }), Logger.layer([logger])]));
});
