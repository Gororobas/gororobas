import { it } from "@effect/vitest";
import { Auth, Sessions } from "@yielded/auth";
import * as OAuthCrypto from "@yielded/auth-crypto/OAuth";
import { AuthRequest } from "@yielded/auth/Auth";
import { AuthContract } from "@yielded/auth/contracts";
import { LifecycleHooks } from "@yielded/auth/Hooks";
import {
  OAuthCallbackId,
  OAuthConnectedActionEvidence,
  OAuthConnectedActionRequired,
  OAuthConnectedPersistence,
  OAuthConnectedProtocol,
  OAuthModuleId,
  OAuthCommandId,
  OAuthProtocol,
  OAuthRedirectUri,
  OAuthReturnTargets,
  OAuthUnavailable,
} from "@yielded/auth/OAuth";
import { guest, RequestBindingFlowId, type AuthCredentialCommand } from "@yielded/auth/Operations";
import { SubjectId } from "@yielded/auth/Schema";
import { AuthenticationFlowId, AuthenticationRequirement } from "@yielded/auth/Sessions";
import { OAuth } from "@yielded/auth/strategies";
import * as Strava from "@yielded/auth/Strava";
import { layerWebCrypto } from "@yielded/auth/WebCrypto";
import { sql as drizzleSql } from "drizzle-orm";
import {
  Context,
  DateTime,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Logger,
  Redacted,
  Schema,
} from "effect";
import { Base64Url } from "effect/encoding";
import { HttpClient, HttpClientResponse } from "effect/http";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { expect } from "vite-plus/test";

import { makeStorage } from "../src/oauth-storage";

const keys = (byte: number) => ({
  activeKeyId: "key",
  keys: [{ id: "key", material: Redacted.make(Base64Url.encode(new Uint8Array(32).fill(byte))) }],
});

const contract = AuthContract.make("strava-test", {
  claims: Schema.Struct({ role: Schema.Literal("member"), athleteId: Schema.Int }),
  actions: (sessions) => ({
    signIn: AuthContract.oauthSignIn(),
    completeSignIn: AuthContract.oauthCompleteSignIn(sessions),
  }),
});

const profile = Strava.accessProfile({ clientId: "1234", scopes: ["activity:read_all"] });

const AppAuth = Auth.make(contract, {
  sessions: Sessions.stateless({ keys: keys(1) }),
  strategies: { oauth: OAuth.make({ access: profile }) },
  defaultStrategy: "oauth",
});

const oauth = AppAuth.strategies.oauth;
const moduleId = OAuthModuleId.make("strava-test/oauth");
const subjectId = SubjectId.make("athlete-123");
const callbackId = OAuthCallbackId.make("strava");

// The real adapter reads engine time after locking. Advance that clock and the
// workflow's TestClock together so expiry and claim deadlines agree.
const durable = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    yield* sql`CREATE TABLE oauth_test_clock (millis INTEGER NOT NULL)`;
    yield* sql`INSERT INTO oauth_test_clock VALUES (${DateTime.toEpochMillis(yield* DateTime.now)})`;
  }),
).pipe(
  Layer.provideMerge(
    makeStorage({
      moduleId,
      provider: profile.provider,
      issuer: "https://www.strava.com",
      externalSubject: "123",
      subjectId,
      filename: ":memory:",
      clock: {
        engineNowMillis: drizzleSql`(SELECT millis FROM oauth_test_clock)`,
        encodeInstant: (millis) => millis,
        decodeInstant: Schema.decodeUnknownSync(Schema.Int),
      },
    }),
  ),
  Layer.provide(LifecycleHooks.empty),
);

const actionEvidence = Layer.succeed(OAuthConnectedActionEvidence, {
  verify: Effect.fnUntraced(function* ({
    invocation,
    challenge,
    proof,
  }: Parameters<OAuthConnectedActionEvidence["Service"]["verify"]>[0]) {
    if (
      invocation._tag !== "Authenticated" ||
      invocation.subjectId !== subjectId ||
      challenge.action !== "connected-disconnect" ||
      proof === undefined ||
      Redacted.value(proof) !== "disconnect-proof"
    )
      return yield* OAuthConnectedActionRequired.make({});
    const credential = challenge.revision.credentials[0];

    if (credential === undefined) return yield* OAuthConnectedActionRequired.make({});

    return {
      requirement: AuthenticationRequirement.make({
        maximumAgeMillis: 300_000,
        alternatives: [
          {
            factors: ["possession"],
            minimumCredentials: 1,
            userVerified: false,
            phishingResistant: false,
          },
        ],
      }),
      evidence: Sessions.AuthenticationEvidence.make({
        revision: challenge.revision,
        flowId: AuthenticationFlowId.make(challenge.flowId),
        bindingDigest: challenge.bindingDigest,
        proofs: [
          {
            method: "oauth",
            credentialId: credential.credentialId,
            factors: ["possession" as const],
            userVerified: false,
            phishingResistant: false,
            verifiedAt: yield* DateTime.now,
          },
        ],
      }),
    };
  }),
});

const advance = Effect.fnUntraced(function* (duration: Duration.Input) {
  const sql = yield* SqlClient.SqlClient;
  const now = DateTime.toEpochMillis(yield* DateTime.now) + Duration.toMillis(duration);

  yield* sql`UPDATE oauth_test_clock SET millis = ${now}`;
  yield* TestClock.adjust(duration);
});

const harness = (
  settings: {
    actionEvidence?: OAuthConnectedActionEvidence["Service"];
    authorizationUrl?: (value: Redacted.Redacted<string>) => Redacted.Redacted<string>;
    failedRefresh?: boolean;
    unknownGrantCommit?: boolean;
    onRequest?: (operation: string) => Effect.Effect<void>;
  } = {},
) => {
  const requests: string[] = [];
  const signals: AbortSignal[] = [];

  const client = HttpClient.make((request, url, signal) =>
    Effect.gen(function* () {
      const body =
        request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : "";

      const form = new URLSearchParams(body);
      const operation = form.get("grant_type") ?? url.pathname;

      requests.push(operation);
      signals.push(signal);
      if (settings.onRequest) yield* settings.onRequest(operation);
      if (settings.failedRefresh && operation === "refresh_token")
        return yield* Effect.die("provider disconnected after consuming refresh token");

      const payload = url.pathname.endsWith("athlete")
        ? { id: 123 }
        : {
            token_type: "Bearer",
            access_token: operation === "refresh_token" ? "second-access" : "first-access",
            refresh_token: operation === "refresh_token" ? "second-refresh" : "first-refresh",
            expires_at: operation === "refresh_token" ? 43200 : 21600,
            athlete: { id: 123, firstname: "Pat" },
            scope: "activity:read_all",
          };

      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } }),
      );
    }),
  );

  const storage = settings.unknownGrantCommit
    ? Layer.effect(
        OAuthConnectedPersistence,
        Effect.gen(function* () {
          const persistence = yield* OAuthConnectedPersistence;

          return OAuthConnectedPersistence.of({
            ...persistence,
            settleSignIn: (input, prepare) =>
              persistence
                .settleSignIn(input, prepare)
                .pipe(
                  Effect.flatMap((receipt) =>
                    input.outcome._tag === "Verified"
                      ? Effect.fail(OAuthUnavailable.make({}))
                      : Effect.succeed(receipt),
                  ),
                ),
          });
        }),
      ).pipe(Layer.provideMerge(durable))
    : durable;

  const protocols = Layer.effectContext(
    Effect.gen(function* () {
      const configured = yield* Strava.provider({
        clientId: "1234",
        clientSecret: Redacted.make("client-secret"),
        access: profile,
      }).configure({
        provider: profile.provider,
        callbacks: [
          {
            callbackId,
            redirectUri: OAuthRedirectUri.make("https://app.example.com/auth/strava/callback"),
          },
        ],
      });

      if (configured.connected === undefined) return yield* OAuthUnavailable.make({});
      const connected = configured.connected;

      return Context.make(OAuthProtocol, configured).pipe(
        Context.add(OAuthConnectedProtocol, {
          ...connected,
          prepareAuthorization: (input) =>
            connected.prepareAuthorization(input).pipe(
              Effect.map((prepared) => ({
                ...prepared,
                authorizationUrl:
                  settings.authorizationUrl?.(prepared.authorizationUrl) ??
                  prepared.authorizationUrl,
              })),
            ),
        }),
      );
    }),
  );

  const live = Layer.mergeAll(AppAuth.layer, oauth.access.accessLayer, oauth.access.layer).pipe(
    Layer.provide(LifecycleHooks.empty),
    Layer.provide(oauth.access.binding.layer),
    Layer.provide(
      settings.actionEvidence === undefined
        ? actionEvidence
        : Layer.succeed(OAuthConnectedActionEvidence, settings.actionEvidence),
    ),
    Layer.provide(protocols),
    Layer.provide(OAuthCrypto.transactionLayer(keys(2))),
    Layer.provide(OAuthCrypto.connectedTransactionLayer(keys(2))),
    Layer.provide(OAuthCrypto.connectedTokenLayer(keys(3))),
    Layer.provide(
      Auth.RequestBindingConfig.layer({ generation: 1, lifetimeMillis: 600_000, keyring: keys(4) }),
    ),
    Layer.provide(OAuthReturnTargets.exactRoutes(["/sync"])),
    Layer.provide(layerWebCrypto),
    Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
    Layer.provide(
      Layer.succeed(oauth.SessionClaims, {
        resolve: () => Effect.succeed({ role: "member" as const, athleteId: 123 }),
      }),
    ),
    Layer.provideMerge(storage),
  );

  return { live, requests, signals };
};

const start = Effect.gen(function* () {
  const auth = yield* AppAuth;
  const commands: AuthCredentialCommand[] = [];

  const call = {
    invocation: guest,
    credentials: {},
    credentialCommandSink: (issued: readonly AuthCredentialCommand[]) =>
      Effect.sync(() => {
        commands.push(...issued);
      }),
  };

  const begin = yield* auth
    .signIn({ provider: profile.provider, returnTarget: "/sync" })
    .pipe(Effect.provideService(AuthRequest, call));

  const location = new URL(Redacted.value(begin.authorizationUrl));

  const binding = commands.find(
    (command) => command._tag === "Issue" && command.slot === "request-binding",
  );

  if (binding?._tag !== "Issue") return yield* Effect.die("Missing request binding");
  commands.length = 0;

  const complete = auth
    .completeSignIn({
      flowId: begin.flowId,
      provider: profile.provider,
      callbackId,
      response: {
        _tag: "Code",
        code: "authorization-code",
        state: location.searchParams.get("state")!,
        scope: "activity:read_all",
      },
    })
    .pipe(
      Effect.provideService(AuthRequest, {
        ...call,
        credentials: { "request-binding": binding.credential },
      }),
    );

  return { auth, commands, complete, call };
});

const signIn = Effect.gen(function* () {
  const started = yield* start;
  const result = yield* started.complete;

  if (
    !("completion" in result) ||
    result.completion._tag !== "Authenticated" ||
    result.connection === undefined
  )
    return yield* Effect.die("Sign-in did not authenticate and connect");

  const issued = started.commands.find(
    (command) => command._tag === "Issue" && command.slot === "session",
  );

  if (issued?._tag !== "Issue") return yield* Effect.die("Missing session credential");

  const session = yield* started.auth.requireSession().pipe(
    Effect.provideService(AuthRequest, {
      ...started.call,
      credentials: { session: issued.credential },
    }),
  );

  const access = yield* oauth.access.ConnectedAccess;

  const caller = {
    _tag: "Authenticated" as const,
    subjectId: session.subjectId,
    sessionId: session.sessionId,
    assurance: session.assurance,
  };

  return { ...started, session, caller, connection: result.connection, access };
});

it.effect("an uncertain refresh is never repeated, including after the attempt deadline", () => {
  const h = harness({ failedRefresh: true });
  const logs: Array<string> = [];

  const logger = Logger.make((entry) =>
    logs.push(JSON.stringify(Logger.formatStructured.log(entry))),
  );

  return Effect.gen(function* () {
    const signedIn = yield* signIn;

    yield* advance("6 hours");

    const use = signedIn.access.withAccessToken(
      signedIn.caller,
      signedIn.connection,
      () => Effect.void,
    );

    expect(Exit.isFailure(yield* Effect.exit(use))).toBe(true);
    yield* advance("1 hour");
    expect(Exit.isFailure(yield* Effect.exit(use))).toBe(true);
    expect(h.requests.filter((value) => value === "refresh_token")).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("Auth oauth-connected failed");
    expect(logs[0]).not.toContain("provider disconnected after consuming refresh token");
  }).pipe(Effect.provide([h.live, Logger.layer([logger])]));
});

it.effect("libSQL persistence rejects ambient transactions", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const persistence = yield* OAuthConnectedPersistence;

    // Never expose a successful storage result before an outer owner's commit.
    const error = yield* sql
      .withTransaction(persistence.capture({ moduleId, subjectId }))
      .pipe(Effect.flip);

    expect(error._tag).toBe("OAuthUnavailable");
  }).pipe(Effect.provide(durable)),
);

// Requested regression seam: resolve an internally generated connected target
// before verifying independent evidence, then execute that exact retained target.
it.effect("connected preparation retains its exact target until authorized execution", () => {
  // 29aef9a retained the URL inside a smaller transaction envelope. Exercise the
  // protocol's admitted string bound, including worst-case JSON escaping.
  let authorizationUrl = Redacted.make("");

  let target:
    | Parameters<OAuthConnectedActionEvidence["Service"]["verify"]>[0]["challenge"]
    | undefined;

  let verifications = 0;

  const h = harness({
    authorizationUrl: (value) => {
      authorizationUrl = Redacted.make(
        `${Redacted.value(value)}&padding=`.padEnd(16_384, "\u0000"),
      );

      return authorizationUrl;
    },
    actionEvidence: {
      verify: Effect.fnUntraced(function* ({ invocation, challenge, proof }) {
        verifications++;
        if (
          invocation._tag !== "Authenticated" ||
          proof === undefined ||
          Redacted.value(proof) !== "begin-proof" ||
          target === undefined ||
          JSON.stringify(challenge) !== JSON.stringify(target)
        )
          return yield* OAuthConnectedActionRequired.make({});
        const credential = challenge.revision.credentials[0];

        if (credential === undefined) return yield* OAuthConnectedActionRequired.make({});

        return {
          requirement: AuthenticationRequirement.make({
            maximumAgeMillis: 300_000,
            alternatives: [
              {
                factors: ["possession"],
                minimumCredentials: 1,
                userVerified: false,
                phishingResistant: false,
              },
            ],
          }),
          evidence: Sessions.AuthenticationEvidence.make({
            flowId: AuthenticationFlowId.make(challenge.flowId),
            bindingDigest: challenge.bindingDigest,
            revision: challenge.revision,
            proofs: [
              {
                method: "independent-test-factor",
                credentialId: credential.credentialId,
                factors: ["possession"],
                userVerified: false,
                phishingResistant: false,
                verifiedAt: yield* DateTime.now,
              },
            ],
          }),
        };
      }),
    },
  });

  return Effect.gen(function* () {
    const signedIn = yield* signIn;
    const connected = yield* oauth.access.Connected;

    const input = {
      flowId: RequestBindingFlowId.make("prepared-flow"),
      commandId: OAuthCommandId.make("prepared-command"),
      callbackId,
      intent: {
        _tag: "Reconnect" as const,
        grantId: signedIn.connection.grantId,
        profileKey: profile.key,
      },
      returnTarget: "/sync",
    };

    const prepared = yield* connected.prepareBegin(signedIn.caller, input);

    const issued = prepared.credentialCommands.find(
      (command) => command._tag === "Issue" && command.slot === "connected-intent",
    );

    if (issued?._tag !== "Issue")
      return yield* Effect.die("Missing private preparation credential");
    expect(Object.keys(prepared.value)).toEqual(["flowId", "expiresAtMillis"]);

    const command = {
      ...input,
      preparationCredential: issued.credential,
      actionProof: Redacted.make("begin-proof"),
    };

    target = yield* connected.beginContext(signedIn.caller, command);
    expect(verifications).toBe(0);
    yield* advance("1 second");
    const repeated = yield* connected.beginContext(signedIn.caller, command);

    expect(repeated).toEqual(target);
    expect(
      (yield* connected
        .beginContext(signedIn.caller, {
          ...command,
          commandId: OAuthCommandId.make("other-command"),
        })
        .pipe(Effect.flip))._tag,
    ).toBe("OAuthRejected");
    const result = yield* connected.begin(signedIn.caller, command);

    expect(Redacted.value(result.value.authorizationUrl)).toBe(Redacted.value(authorizationUrl));
    expect(verifications).toBe(1);
    expect(result.value.expiresAtMillis).toBe(prepared.value.expiresAtMillis);
    expect(
      result.credentialCommands.some(
        (value) =>
          value._tag === "Issue" &&
          value.slot === "request-binding" &&
          Redacted.value(value.credential) === Redacted.value(issued.credential),
      ),
    ).toBe(true);
    expect((yield* connected.begin(signedIn.caller, command).pipe(Effect.flip))._tag).toBe(
      "OAuthRejected",
    );
    expect(verifications).toBe(1);
    const sql = yield* SqlClient.SqlClient;

    const rows =
      yield* sql`SELECT snapshot, state FROM oauth_connected_flow WHERE flowId = ${input.flowId}`;

    expect(rows[0]?.state).toBe("Pending");
    expect(JSON.stringify(rows)).not.toContain(Redacted.value(issued.credential));
    expect(rows[0]?.snapshot).not.toContain(
      JSON.stringify(Redacted.value(result.value.authorizationUrl)),
    );
  }).pipe(Effect.provide(h.live));
});

it.effect(
  "a lost grant-commit response issues no session and cannot repeat the authorization code",
  () => {
    const h = harness({ unknownGrantCommit: true });

    return Effect.gen(function* () {
      const started = yield* start;

      expect((yield* started.complete.pipe(Effect.flip))._tag).toBe("OAuthUnavailable");
      expect(started.commands).toHaveLength(0);
      const sql = yield* SqlClient.SqlClient;
      const grants = yield* sql`SELECT grantId FROM oauth_connected_grant`;

      expect(grants).toHaveLength(1);
      expect((yield* started.complete.pipe(Effect.flip))._tag).toBe("OAuthRejected");
      expect(h.requests.filter((value) => value === "authorization_code")).toHaveLength(1);
    }).pipe(Effect.provide(h.live));
  },
);

it.effect(
  "a stalled callback times out, closes its provider work, and cannot be exchanged again",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const finalized = yield* Deferred.make<void>();

      const h = harness({
        onRequest: () =>
          Deferred.succeed(entered, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Deferred.succeed(finalized, undefined)),
          ),
      });

      yield* Effect.gen(function* () {
        const started = yield* start;
        const fiber = yield* started.complete.pipe(Effect.flip, Effect.forkChild);

        yield* Deferred.await(entered);
        yield* advance("31 seconds");
        expect((yield* Fiber.join(fiber))._tag).toBe("OAuthUnavailable");
        expect(yield* Deferred.isDone(finalized)).toBe(true);
        expect(h.signals.every((signal) => signal.aborted)).toBe(true);
        expect((yield* started.complete.pipe(Effect.flip))._tag).toBe("OAuthRejected");
        expect(h.requests).toEqual(["authorization_code"]);
      }).pipe(Effect.provide(h.live));
    }),
);

it.effect(
  "concurrent refresh callers exchange once, and disconnect prevents a late refresh from restoring access",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const proceed = yield* Deferred.make<void>();

      const h = harness({
        onRequest: (operation) =>
          operation === "refresh_token"
            ? Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(proceed)))
            : Effect.void,
      });

      yield* Effect.gen(function* () {
        const signedIn = yield* signIn;

        yield* advance("6 hours");
        let uses = 0;

        const access = signedIn.access.withAccessToken(signedIn.caller, signedIn.connection, () =>
          Effect.sync(() => {
            uses++;
          }),
        );

        const first = yield* access.pipe(Effect.forkChild);

        yield* Deferred.await(entered);
        expect(Exit.isFailure(yield* Effect.exit(access))).toBe(true);
        yield* signedIn.auth
          .disconnectAccount({
            commandId: "disconnect",
            grantId: signedIn.connection.grantId,
            actionProof: "disconnect-proof",
          })
          .pipe(
            Effect.provideService(AuthRequest, { ...signedIn.call, invocation: signedIn.caller }),
          );
        yield* Deferred.succeed(proceed, undefined);
        expect(Exit.isFailure(yield* Effect.exit(Fiber.join(first)))).toBe(true);
        expect(Exit.isFailure(yield* Effect.exit(access))).toBe(true);
        expect(uses).toBe(0);
        expect(h.requests.filter((value) => value === "refresh_token")).toHaveLength(1);
      }).pipe(Effect.provide(h.live));
    }),
);
