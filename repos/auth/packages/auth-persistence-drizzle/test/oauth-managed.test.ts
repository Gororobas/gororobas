import { it } from "@effect/vitest";
import { Auth, OAuth, Operations, Sessions } from "@yielded/auth";
import { OAuthPersistence } from "@yielded/auth-persistence";
import type { CommitJournal, PreparedCommit } from "@yielded/auth/Hooks";
import { SubjectId } from "@yielded/auth/Schema";
import * as KdfAdmission from "@yielded/crypto/KdfAdmission";
import * as Portable from "@yielded/crypto/Portable";
import { getTableName } from "drizzle-orm";
import { Context, DateTime, Effect, Layer, Redacted, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { expect } from "vite-plus/test";

import {
  configuration,
  Fitness,
  identity,
  profile,
  requiredService,
  requirement,
  RetainedFitness,
  setup,
  StatelessFitness,
} from "./fixtures/oauth-managed";

// Human-requested composed OAuth regression: managed schema and public driver exports,
// rather than explicit OAuth factories. D1 substitutes only the transport with real SQLite.
const backends = ["sqlite", "d1", "pglite"] as const;
const moduleId = OAuth.OAuthModuleId.make("strava/oauth");

// Human-requested import atomicity: reject authority insertion on both commit owners.
it.live.each(["sqlite", "d1"] as const)(
  "%s OAuth imports roll back partial rows and reject unavailable subjects",
  (backend) =>
    Effect.gen(function* () {
      const fixture = yield* setup(backend, false, "stateful", false);
      const sql = Context.get(fixture.context, SqlClient.SqlClient);
      const importer = requiredService(fixture.context, OAuthPersistence.IdentityImports);

      const input = yield* Schema.decodeEffect(OAuthPersistence.IdentityImport)({
        moduleId,
        subjectId: "athlete",
        ...identity,
      });

      const rejected = (value: typeof input) =>
        Effect.gen(function* () {
          expect(yield* importer.importIdentity(value).pipe(Effect.result)).toMatchObject({
            _tag: "Failure",
            failure: { _tag: "OAuthUnavailable" },
          });
        });

      yield* rejected({ ...input, subjectId: SubjectId.make("missing") });
      yield* rejected({ ...input, moduleId: OAuth.OAuthModuleId.make("disabled") });
      // Admission must use the same snapshot as the deferred import.
      const mutable = { ...input };
      const deferred = importer.importIdentity(mutable);

      mutable.moduleId = OAuth.OAuthModuleId.make("disabled");
      expect(yield* deferred.pipe(Effect.result)).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "OAuthUnavailable" },
      });
      yield* rejected({ ...input, subject: "\ud800" });
      yield* sql`update athletes set active = 0`;
      yield* rejected(input);
      yield* sql`update athletes set active = 1`;
      const authority = getTableName(fixture.table("credentials"));

      yield* sql.unsafe(
        `create trigger reject_import before insert on "${authority}" begin select raise(abort, 'import failure'); end`,
      );
      yield* rejected(input);
      for (const role of ["oauthIdentities", "oauthCredentials", "credentials"]) {
        expect(
          yield* sql`select count(*) as count from ${sql(getTableName(fixture.table(role)))}`,
        ).toEqual([{ count: 0 }]);
      }
      yield* sql`drop trigger reject_import`;
      const imported = yield* importer.importIdentity(input);

      expect(yield* fixture.signIn.resolve({ moduleId, identity })).toMatchObject({
        credentialId: imported.credentialId,
        revision: { subjectId: "athlete" },
      });
      // Migration retries must never repair split authority.
      yield* sql`delete from ${sql(authority)}`;
      yield* rejected(input);
      expect(yield* sql`select count(*) as count from ${sql(authority)}`).toEqual([{ count: 0 }]);
      fixture.assertBatchExecution();
    }),
);

function prepare<A>(value: A, journal: CommitJournal): PreparedCommit<A> {
  return journal.prepare(value);
}

it.live.each([
  ...backends.map((backend) => ({ backend, sessionMode: "stateful" as const })),
  { backend: "d1", sessionMode: "stateless" } as const,
])(
  "$backend $sessionMode managed fitness OAuth signs in an existing athlete and verifies its session",
  ({ backend, sessionMode }) =>
    Effect.gen(function* () {
      const fixture = yield* setup(backend, false, sessionMode, false);
      const app = sessionMode === "stateless" ? StatelessFitness : Fitness;
      const sql = Context.get(fixture.context, SqlClient.SqlClient);
      // Human-requested migration seam (#200): import, retry, then the real callback/session.
      const importer = requiredService(fixture.context, OAuthPersistence.IdentityImports);

      const input = yield* Schema.decodeEffect(OAuthPersistence.IdentityImport)({
        moduleId,
        subjectId: "athlete",
        ...identity,
      });

      const imported = yield* importer.importIdentity(input);

      expect(yield* importer.importIdentity(input)).toEqual(imported);
      yield* sql`insert into athletes (id, active, revision) values ('other', ${backend === "pglite" ? true : 1}, 'other-v1')`;
      expect(
        yield* importer
          .importIdentity({ ...input, subjectId: SubjectId.make("other") })
          .pipe(Effect.result),
      ).toMatchObject({ _tag: "Failure", failure: { _tag: "OAuthUnavailable" } });
      for (const role of ["oauthIdentities", "oauthCredentials", "credentials"]) {
        expect(
          yield* sql`select count(*) as count from ${sql(getTableName(fixture.table(role)))}`,
        ).toEqual([{ count: 1 }]);
      }
      const flowTable = getTableName(fixture.table("oauthSignInFlows"));
      const delivered = new Map<Operations.CredentialSlot, Redacted.Redacted<string>>();
      let exchanges = 0;

      const keyring = {
        activeKeyId: "test",
        keys: [{ id: "test", material: Redacted.make("A".repeat(43)) }],
      };

      const dependencies = Layer.mergeAll(
        Layer.succeed(app.strategies.strava.SessionClaims, {
          resolve: () => Effect.succeed({ displayName: "Ada Athlete" }),
        }),
        Layer.succeed(OAuth.OAuthProtocol, {
          prepareAuthorization: () =>
            Effect.succeed({
              configuration,
              authorizationUrl: Redacted.make("https://www.strava.com/oauth/authorize"),
              secrets: {
                namespace: "effect-auth/oauth-transaction-secrets/v1",
                state: Redacted.make("A".repeat(43)),
              },
            }),
          exchangeVerifiedIdentity: () =>
            Effect.sync(() => {
              exchanges++;

              return { identity };
            }),
        }),
        Layer.succeed(Sessions.SessionSigningKeys, keyring),
        OAuth.OAuthReturnTargets.exactRoutes(["/activities"]),
        OAuth.OAuthTransactionProtector.layer(keyring),
        Auth.RequestBindingConfig.layer({ generation: 1, lifetimeMillis: 300_000, keyring }),
      ).pipe(
        Layer.provideMerge(
          Portable.layer(globalThis.crypto.subtle).pipe(Layer.provide(KdfAdmission.layer())),
        ),
        Layer.provideMerge(Layer.succeedContext(fixture.context)),
      );

      const services = yield* Layer.build(dependencies);
      const auth = yield* app.make.pipe(Effect.provide(services));

      const request = {
        credentials: {},
        credentialCommandSink: (commands: readonly Operations.AuthCredentialCommand[]) =>
          Effect.sync(() => {
            for (const command of commands) {
              if (command._tag === "Issue") delivered.set(command.slot, command.credential);
            }
          }),
      };

      const begun = yield* auth
        .signIn({ provider: "strava", returnTarget: "/activities" })
        .pipe(Effect.provideService(Auth.AuthRequest, request));

      const binding = delivered.get("request-binding");

      if (sessionMode === "stateless") {
        expect(yield* sql`select count(*) as count from ${sql(flowTable)}`).toEqual([{ count: 1 }]);
      }
      expect(binding).toBeDefined();
      if (binding === undefined) throw new Error("Missing private OAuth request binding");

      const callback = {
        flowId: begun.flowId,
        provider: "strava",
        callbackId: "strava",
        requestBinding: Redacted.value(binding),
        response: { _tag: "Code" as const, code: "provider-code", state: "A".repeat(43) },
      };

      const completed = yield* auth
        .completeSignIn(callback)
        .pipe(Effect.provideService(Auth.AuthRequest, request));

      expect(completed).toMatchObject({
        returnTarget: "/activities",
        completion: {
          _tag: "Authenticated",
          session: { subjectId: "athlete", claims: { displayName: "Ada Athlete" } },
        },
      });
      expect(completed).not.toHaveProperty("credentialCommands");
      const session = delivered.get("session");

      expect(session).toBeDefined();
      if (session === undefined) throw new Error("Missing private session credential");
      expect((yield* auth.verifySession(session)).subjectId).toBe("athlete");
      if (sessionMode === "stateless") {
        expect(
          yield* sql`select name from sqlite_master where type = 'table' and name = 'auth_sessions'`,
        ).toEqual([]);
        expect(yield* sql`select count(*) as count from ${sql(flowTable)}`).toEqual([{ count: 0 }]);
      }

      const replay = yield* auth
        .completeSignIn(callback)
        .pipe(Effect.provideService(Auth.AuthRequest, request), Effect.result);

      expect(replay).toMatchObject({ _tag: "Failure", failure: { _tag: "OAuthRejected" } });
      expect(exchanges).toBe(1);
      expect(yield* fixture.signIn.resolve({ moduleId, identity })).toMatchObject({
        credentialId: imported.credentialId,
        revision: { subjectId: "athlete", securityRevision: expect.any(String) },
      });
      expect(
        yield* fixture.signIn.resolve({
          moduleId,
          identity: { ...identity, subject: "unknown-athlete" },
        }),
      ).toBeUndefined();
      fixture.assertBatchExecution();
    }),
  { timeout: 30_000 },
);

it.live.each(backends)(
  "%s managed retained OAuth persists connected flows, grants and revocation custody",
  (backend) =>
    Effect.gen(function* () {
      const fixture = yield* setup(backend, true);
      const connected = requiredService(fixture.context, OAuth.OAuthConnectedPersistence);
      const revocations = requiredService(fixture.context, OAuth.OAuthConnectedRevocations);
      const credential = yield* fixture.signIn.resolve({ moduleId, identity });

      expect(credential).toBeDefined();
      if (credential === undefined) throw new Error("Missing existing OAuth credential");
      const now = DateTime.toEpochMillis(yield* DateTime.now);

      const flow = yield* Schema.decodeEffect(OAuth.OAuthSignInFlow)({
        context: {
          ...configuration,
          namespace: "effect-auth/oauth-sign-in-context/v1",
          moduleId,
          generation: 1,
          flowId: "retained-sign-in",
          access: profile,
          returnTarget: "/activities",
          stateDigest: "A".repeat(43),
          requestBindingVerifier: "B".repeat(43),
          requestBindingExpiresAtMillis: now + 300_000,
          issuedAtMillis: now,
          expiresAtMillis: now + 300_000,
          exchangeTimeoutMillis: 30_000,
        },
        sealed: {
          format: "oauth-xchacha20poly1305-v1",
          keyId: "test",
          nonce: "A".repeat(32),
          ciphertext: "A".repeat(22),
        },
      });

      const authorization = yield* Schema.decodeEffect(OAuth.OAuthConnectedActionAuthorization)({
        challenge: {
          moduleId,
          action: "connected-begin",
          flowId: "connect-activity",
          revision: credential.revision,
          intentDigest: "A".repeat(43),
          bindingDigest: "A".repeat(43),
        },
        source: { _tag: "Proof" },
        validUntilMillis: now + 300_000,
        evidence: {
          revision: credential.revision,
          flowId: "connect-activity",
          bindingDigest: "A".repeat(43),
          proofs: [
            {
              method: "oauth",
              credentialId: "strava-login",
              factors: ["possession"],
              userVerified: false,
              phishingResistant: false,
              verifiedAt: now,
            },
          ],
        },
        requirement,
      });

      const connectedFlow = OAuth.OAuthConnectedFlow.make({
        context: {
          ...flow.context,
          namespace: "effect-auth/oauth-connected-context/v1",
          flowId: authorization.challenge.flowId,
          revision: credential.revision,
          profile,
          grantId: OAuth.OAuthGrantId.make("activity-grant"),
          maximumEvidenceAgeMillis: 300_000,
          authorization,
        },
        sealed: flow.sealed,
      });

      expect((yield* (yield* connected.issue(connectedFlow, prepare)).read)._tag).toBe("Issued");

      const access = {
        ...connectedFlow.context,
        subjectId: credential.revision.subjectId,
      };

      expect((yield* (yield* connected.consume(access, prepare)).read)._tag).toBe("Consumed");
      expect((yield* (yield* connected.consume(access, prepare)).read)._tag).toBe("Rejected");

      const context = yield* Schema.decodeEffect(OAuth.OAuthConnectedTokenContext)({
        namespace: "effect-auth/oauth-connected-token-context/v1",
        moduleId,
        subjectId: credential.revision.subjectId,
        identity,
        configuration: { ...configuration, profile },
        grantId: "activity-grant",
        grantVersion: "grant-v1",
        tokenVersion: "token-v1",
        metadata: {
          scopes: ["activity:read"],
          resources: [],
          accessExpiresAtMillis: now + 3_600_000,
          refreshExpiresAtMillis: now + 86_400_000,
          useUntilMillis: now + 3_600_000,
          refreshUseUntilMillis: now + 86_400_000,
          obtainedAtMillis: now,
        },
      });

      const tokenServices = yield* Layer.build(
        OAuth.OAuthConnectedTokenProtector.layer({
          activeKeyId: "test",
          keys: [{ id: "test", material: Redacted.make("B".repeat(42) + "A") }],
        }).pipe(
          Layer.provideMerge(
            Portable.layer(globalThis.crypto.subtle).pipe(Layer.provide(KdfAdmission.layer())),
          ),
          Layer.provide(Layer.succeedContext(fixture.context)),
        ),
      );

      const protector = Context.get(tokenServices, OAuth.OAuthConnectedTokenProtector);

      const material = yield* Schema.decodeEffect(OAuth.OAuthConnectedTokenMaterial)({
        namespace: "effect-auth/oauth-connected-token-material/v1",
        accessToken: "retained-access-token",
        refreshToken: "retained-refresh-token",
        continuation: { _tag: "OAuth" },
      });

      const grant = OAuth.OAuthConnectedStoredGrant.make({
        context,
        sealed: yield* protector.seal({ context, material }),
      });

      const settled = yield* connected.settle({ _tag: "SignIn", flow, credential, grant }, prepare);

      expect((yield* settled.read)._tag).toBe("Connected");

      const key = {
        moduleId,
        subjectId: credential.revision.subjectId,
        grantId: grant.context.grantId,
      };

      const read = { ...key, selector: { _tag: "Grant" as const, grantId: key.grantId } };
      const stored = yield* connected.read(read);

      expect(stored?.grant?.context).toEqual(grant.context);
      expect(Redacted.value(stored!.grant!.sealed.ciphertext)).toBe(
        Redacted.value(grant.sealed.ciphertext),
      );

      // Regression in ddd5363: fresh-token access skipped the managed policy revision binding.
      let policyRevision = credential.revision.securityRevision;
      const unexpectedProviderCall = Effect.die("Fresh-token use must not contact the provider");
      const accessModule = RetainedFitness.strategies.strava.access;

      const accessServices = yield* Layer.build(
        accessModule.accessLayer.pipe(
          Layer.provide(
            Layer.succeed(OAuth.OAuthConnectedUseAuthority, {
              authorize: (input) =>
                input.purpose === "use"
                  ? Effect.succeed(
                      OAuth.OAuthConnectedUseAuthorization.make({
                        moduleId: input.moduleId,
                        revision: input.captured.revision,
                        policyRevision,
                        expiresAtMillis: OAuth.OAuthInstant.make(now + 300_000),
                        purpose: "use",
                        grantId: input.grantId,
                        profileKey: input.profileKey,
                      }),
                    )
                  : Effect.fail(OAuth.OAuthUnavailable.make({})),
            }),
          ),
          Layer.provide(
            Layer.succeed(OAuth.OAuthConnectedProtocol, {
              prepareAuthorization: () => unexpectedProviderCall,
              exchangeGrant: () => unexpectedProviderCall,
              refreshGrant: () => unexpectedProviderCall,
              revokeGrant: () => unexpectedProviderCall,
            }),
          ),
          Layer.provide(Layer.succeedContext(Context.merge(fixture.context, tokenServices))),
        ),
      );

      const tokenAccess = Context.get(accessServices, accessModule.ConnectedAccess);
      let tokenUses = 0;

      const useToken = tokenAccess.withAccessToken(
        {
          _tag: "Authenticated",
          subjectId: key.subjectId,
          assurance: Operations.AuthenticationAssurance.make({
            method: "oauth",
            factors: ["possession"],
            authenticatedAt: DateTime.makeUnsafe(now),
          }),
        },
        { grantId: key.grantId, profileKey: profile.key },
        (token) =>
          Effect.sync(() => {
            tokenUses++;

            return Redacted.value(token);
          }),
      );

      expect(yield* useToken).toBe("retained-access-token");
      policyRevision = Sessions.SecurityRevision.make("independent-policy");
      expect(yield* Effect.result(useToken)).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "OAuthRejected" },
      });
      expect(tokenUses).toBe(1);

      const disconnected = yield* connected.disconnect(
        {
          key,
          grantVersion: grant.context.grantVersion,
          authorization: {
            ...authorization,
            challenge: { ...authorization.challenge, action: "connected-disconnect" },
          },
        },
        prepare,
      );

      expect(yield* disconnected.read).toEqual({
        _tag: "Disconnected",
        grantId: key.grantId,
        remoteRevocation: "Pending",
      });
      expect((yield* connected.read(read))?.grant).toBeUndefined();

      const claimed = yield* (yield* revocations.claim(
        {
          moduleId,
          claimId: OAuth.OAuthClaimId.make("C".repeat(43)),
          lifetimeMillis: 30_000,
        },
        prepare,
      )).read;

      expect(claimed._tag).toBe("Claimed");
      if (claimed._tag !== "Claimed") throw new Error("Missing durable revocation job");
      expect(claimed.claim.job.grant.context).toEqual(grant.context);
      expect(Redacted.value(claimed.claim.job.grant.sealed.ciphertext)).toBe(
        Redacted.value(grant.sealed.ciphertext),
      );
      expect(
        yield* (yield* revocations.settle(
          {
            claim: claimed.claim,
            outcome: "Confirmed",
          },
          prepare,
        )).read,
      ).toEqual({ settled: true });
      expect(
        (yield* (yield* revocations.claim(
          {
            moduleId,
            claimId: OAuth.OAuthClaimId.make("D".repeat(43)),
            lifetimeMillis: 30_000,
          },
          prepare,
        )).read)._tag,
      ).toBe("Empty");
      expect(yield* fixture.signIn.resolve({ moduleId, identity })).toBeDefined();
      fixture.assertBatchExecution();
    }),
  { timeout: 30_000 },
);
