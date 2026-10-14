import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { it } from "@effect/vitest";
import * as OAuthServer from "@yielded/auth/OAuthServer";
import { SubjectId } from "@yielded/auth/Schema";
import * as WebCrypto from "@yielded/auth/WebCrypto";
import * as KdfAdmission from "@yielded/crypto/KdfAdmission";
import * as CryptoBackend from "@yielded/crypto/WebCrypto";
import { Jwk, Jwt } from "@yielded/jose";
import { Clock, Effect, Exit, Fiber, Layer, Redacted, Schema } from "effect";
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai";
import { Base64Url } from "effect/encoding";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
  HttpRouter,
  HttpServerRequest,
} from "effect/http";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { expect } from "vite-plus/test";

import { OAuthServerPersistence } from "../src/internal/oauth-server";

const server = OAuthServer.make("mcp", { scopes: ["read", "write"] });
const origin = "https://app.example.com";
const resource = `${origin}/mcp`;
const redirectUri = "https://client.example.com/callback";
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const cryptoLayer = Layer.merge(
  WebCrypto.layerWebCrypto,
  CryptoBackend.layer(globalThis.crypto.subtle).pipe(Layer.provide(KdfAdmission.layer())),
);

const config: OAuthServer.Options = {
  origin,
  resource,
  loginPath: "/login",
  clients: [{ clientId: "client", name: "Example <client>", redirectUris: [redirectUri] }],
  keys: {
    activeKeyId: "v1",
    keys: [{ id: "v1", material: Redacted.make(Base64Url.encode(new Uint8Array(32).fill(9))) }],
  },
};

const harness = (
  fault?: Effect.Effect<void, OAuthServer.Unavailable>,
  options: OAuthServer.Options = config,
  http = FetchHttpClient.layer,
) => {
  const database = Layer.effectDiscard(
    Effect.gen(function* () {
      for (const migration of OAuthServerPersistence.migrations)
        yield* (yield* SqlClient.SqlClient).unsafe(migration);
    }),
  ).pipe(Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })));

  const storage = OAuthServerPersistence.layer.pipe(Layer.provideMerge(database));

  const durable = fault
    ? Layer.effect(
        OAuthServer.Persistence,
        Effect.gen(function* () {
          const store = yield* OAuthServer.Persistence;

          return OAuthServer.Persistence.of({
            ...store,
            compareAndSet: (namespace, id, version, record) =>
              Effect.gen(function* () {
                const saved = yield* store.compareAndSet(namespace, id, version, record);

                if (record.status === "Active" && saved) yield* fault;

                return saved;
              }),
          });
        }),
      ).pipe(Layer.provideMerge(storage))
    : storage;

  const identity = Layer.succeed(server.Identity, {
    current: Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      // Test-only identity authority. Production verifies an application session.
      const user = request.headers["test-user"];

      return user === undefined ? undefined : SubjectId.make(user);
    }),
  });

  return server
    .layer(options)
    .pipe(
      Layer.provide(identity),
      Layer.provide(http),
      Layer.provideMerge(durable),
      Layer.provideMerge(cryptoLayer),
    );
};

const get = (path: string, cookie?: string, user = "alice") =>
  new Request(`${origin}${path}`, {
    headers: { "test-user": user, ...(cookie ? { cookie } : {}) },
  });

const post = (path: string, data: Record<string, string>, cookie?: string, user = "alice") =>
  new Request(`${origin}${path}`, {
    method: "POST",
    headers: { "test-user": user, origin, ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams(data),
  });

const body = <S extends Schema.Top>(response: Response, schema: S) =>
  Effect.promise(() => response.json()).pipe(Effect.flatMap(Schema.decodeUnknownEffect(schema)));

const Tokens = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  scope: Schema.String,
  token_type: Schema.Literal("Bearer"),
  expires_in: Schema.Int,
});

const consentToken = (html: string) => {
  const csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1] ?? "";

  expect(csrf).not.toBe("");

  return csrf;
};

const start = (user = "alice", scope = "read", overrides: Record<string, string> = {}) =>
  Effect.gen(function* () {
    const service = yield* server.Service;

    const query = new URLSearchParams({
      response_type: "code",
      client_id: "client",
      redirect_uri: redirectUri,
      resource,
      scope,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "client-state",
      ...overrides,
    });

    const response = yield* service.handle(
      get(`${server.paths.authorize}?${query}`, undefined, user),
    );

    expect(response.status).toBe(303);
    const consentCookie = response.headers.getSetCookie()[0];

    // Requested hardening: the browser must enforce a host-only consent cookie on HTTPS.
    expect(consentCookie.split("=", 1)[0]).toBe("__Host-yielded-mcp-consent");
    expect(
      consentCookie
        .split(";")
        .slice(1)
        .map((attribute) => attribute.trim()),
    ).toContain("Path=/");
    const cookie = consentCookie.split(";")[0];

    const consent = yield* service.handle(get(server.paths.authorize, cookie, user));

    expect(consent.status).toBe(200);
    const html = yield* Effect.promise(() => consent.text());

    return { service, cookie, csrf: consentToken(html), user, html };
  });

const authorize = (user = "alice", scope = "read", overrides: Record<string, string> = {}) =>
  Effect.gen(function* () {
    const flow = yield* start(user, scope, overrides);

    const response = yield* flow.service.handle(
      post(server.paths.authorize, { csrf: flow.csrf, decision: "approve" }, flow.cookie, user),
    );

    expect(response.status).toBe(303);
    const redirect = new URL(response.headers.get("location")!);

    return { ...flow, code: redirect.searchParams.get("code")! };
  });

const exchange = (code: string) =>
  post(server.paths.token, {
    grant_type: "authorization_code",
    client_id: "client",
    resource,
    redirect_uri: redirectUri,
    code,
    code_verifier: verifier,
  });

const issue = (user = "alice", scope = "read") =>
  Effect.gen(function* () {
    const flow = yield* authorize(user, scope);
    const response = yield* flow.service.handle(exchange(flow.code));

    expect(response.status).toBe(200);

    return { ...flow, tokens: yield* body(response, Tokens) };
  });

const refresh = (token: string) =>
  post(server.paths.token, {
    grant_type: "refresh_token",
    client_id: "client",
    resource,
    refresh_token: token,
  });

it.effect("switching accounts invalidates previously rendered consent", () =>
  Effect.gen(function* () {
    const flow = yield* start("alice");
    const consent = yield* flow.service.handle(get(server.paths.authorize, flow.cookie, "bob"));

    expect(consent.status).toBe(200);
    const csrf = consentToken(yield* Effect.promise(() => consent.text()));

    const stale = yield* flow.service.handle(
      post(server.paths.authorize, { csrf: flow.csrf, decision: "approve" }, flow.cookie, "bob"),
    );

    expect(stale.status).toBe(400);
    expect(stale.headers.has("location")).toBe(false);

    const approved = yield* flow.service.handle(
      post(server.paths.authorize, { csrf, decision: "approve" }, flow.cookie, "bob"),
    );

    expect(approved.status).toBe(303);
    const code = new URL(approved.headers.get("location")!).searchParams.get("code")!;
    const tokens = yield* body(yield* flow.service.handle(exchange(code)), Tokens);
    const access = yield* flow.service.verify(Redacted.make(tokens.access_token));

    expect(access.subjectId).toBe("bob");
  }).pipe(Effect.provide(harness())),
);

it.effect("rejects an issued token for another resource under the same authority", () =>
  Effect.gen(function* () {
    const flow = yield* authorize();
    const exchanged = yield* flow.service.handle(exchange(flow.code));
    const tokens = yield* body(exchanged, Tokens);

    yield* flow.service.verify(Redacted.make(tokens.access_token));

    const otherResource = server
      .layer({ ...config, resource: `${origin}/other` })
      .pipe(Layer.provide(Layer.succeed(server.Identity, { current: Effect.succeed(undefined) })));

    const crossResource = yield* Effect.gen(function* () {
      return yield* (yield* server.Service).verify(Redacted.make(tokens.access_token));
    }).pipe(Effect.exit, Effect.provide(otherResource.pipe(Layer.provide(FetchHttpClient.layer))));

    expect(Exit.isFailure(crossResource)).toBe(true);
  }).pipe(Effect.provide(harness())),
);

it.effect(
  "concurrent refresh never delivers two grants and a replay disables the winning token",
  () =>
    Effect.gen(function* () {
      const flow = yield* issue();

      const results = yield* Effect.all(
        [
          flow.service.handle(refresh(flow.tokens.refresh_token)),
          flow.service.handle(refresh(flow.tokens.refresh_token)),
        ],
        { concurrency: 2 },
      );

      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);

      const tokens = yield* body(
        results.find((r) => r.status === 200)!,
        Tokens,
      );

      expect(
        Exit.isFailure(yield* Effect.exit(flow.service.verify(Redacted.make(tokens.access_token)))),
      ).toBe(true);
    }).pipe(Effect.provide(harness())),
);

it.effect("a lost issuance commit returns no credentials and cannot be reissued", () =>
  Effect.gen(function* () {
    const flow = yield* authorize();
    const response = yield* flow.service.handle(exchange(flow.code));

    expect(response.status).toBe(503);
    expect(yield* Effect.promise(() => response.text())).not.toContain("access_token");
    expect((yield* flow.service.handle(exchange(flow.code))).status).toBe(400);
  }).pipe(Effect.provide(harness(Effect.fail(OAuthServer.Unavailable.make({}))))),
);

it.effect(
  "Effect's MCP HTTP transport receives an isolated authenticated principal on each tool call",
  () =>
    Effect.gen(function* () {
      const alice = yield* issue("alice");
      const bob = yield* issue("bob");

      const toolkit = Toolkit.make(
        Tool.make("whoami", { success: Schema.String, failure: OAuthServer.InvalidToken }),
      );

      const tools = McpServer.toolkit(toolkit).pipe(
        Layer.provide(
          toolkit.toLayer({
            whoami: () =>
              Effect.gen(function* () {
                const access = yield* OAuthServer.CurrentAccess;

                if (access === undefined) return yield* OAuthServer.InvalidToken.make({});

                return access.subjectId;
              }),
          }),
        ),
        Layer.provide(
          McpServer.layerHttp({
            name: "test",
            version: "1",
            path: "/mcp",
            protocols: [McpProtocol.v2026_07_28],
          }),
        ),
        Layer.provide(server.middleware(["read"]).layer),
      );

      const routes = Layer.mergeAll(tools, server.routes).pipe(
        Layer.provide(Layer.succeed(server.Service, alice.service)),
        Layer.provideMerge(Layer.succeed(Clock.Clock, yield* Clock.Clock)),
      );

      yield* Effect.acquireUseRelease(
        Effect.sync(() => HttpRouter.toWebHandler(routes, { disableLogger: true })),
        ({ handler }) =>
          Effect.gen(function* () {
            const send = (token?: string) =>
              Effect.promise(() =>
                handler(
                  new Request(resource, {
                    method: "POST",
                    headers: {
                      "content-type": "application/json",
                      accept: "application/json, text/event-stream",
                      "MCP-Protocol-Version": "2026-07-28",
                      "Mcp-Method": "tools/call",
                      "Mcp-Name": "whoami",
                      ...(token ? { authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                      jsonrpc: "2.0",
                      id: 1,
                      method: "tools/call",
                      params: {
                        name: "whoami",
                        arguments: {},
                        _meta: {
                          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                          "io.modelcontextprotocol/clientCapabilities": {},
                        },
                      },
                    }),
                  }),
                ),
              );

            const anonymous = yield* send();

            expect(anonymous.status).toBe(401);
            expect(anonymous.headers.get("www-authenticate")).toContain(
              `resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
            );
            const invalid = yield* send("invalid");

            expect(invalid.status).toBe(401);
            expect(invalid.headers.get("www-authenticate")).toContain('error="invalid_token"');
            for (const [token, user] of [
              [alice.tokens.access_token, "alice"],
              [bob.tokens.access_token, "bob"],
              [alice.tokens.access_token, "alice"],
            ]) {
              const response = yield* send(token);

              expect(response.status).toBe(200);

              const json = yield* body(
                response,
                Schema.Struct({
                  result: Schema.Struct({
                    content: Schema.Array(Schema.Struct({ text: Schema.String })),
                  }),
                }),
              );

              expect(json.result.content[0].text).toBe(JSON.stringify(user));
            }
          }),
        ({ dispose }) => Effect.promise(dispose),
      );
    }).pipe(Effect.provide(harness())),
);

// User-requested red/green proof against MCP 2026-07-28 and its OAuth 2.1 profile.
// Exercise HTTP + real SQLite; substitute only remote metadata and time so invalid
// documents, cache expiry, and stalled fetches are repeatable without external hosts.
const metadataId = "https://client.example.com/oauth/client.json";

const metadata = {
  client_id: metadataId,
  client_name: "Remote <assistant>",
  redirect_uris: [redirectUri],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
};

const metadataConfig = {
  ...config,
  clientMetadata: { allowedOrigins: ["https://client.example.com"] },
};

const transport = (respond: (url: string) => Response) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => HttpClientResponse.fromWeb(request, respond(request.url))),
    ),
  );

const remoteHarness = (respond: (url: string) => Response, options = metadataConfig) =>
  harness(undefined, options, transport(respond));

const remoteExchange = (code: string, extra: Record<string, string> = {}) =>
  post(server.paths.token, {
    grant_type: "authorization_code",
    client_id: metadataId,
    resource,
    code,
    code_verifier: verifier,
    ...extra,
  });

const begin = (extra: Record<string, string> = {}) =>
  get(
    `${server.paths.authorize}?${new URLSearchParams({
      response_type: "code",
      client_id: metadataId,
      redirect_uri: redirectUri,
      resource,
      scope: "read",
      code_challenge: challenge,
      code_challenge_method: "S256",
      ...extra,
    })}`,
  );

it.effect(
  "CIMD discovery, consent, PKCE exchange, refresh and revocation work without pre-registration",
  () => {
    let fetches = 0;

    return Effect.gen(function* () {
      const service = yield* server.Service;

      const discovery = yield* body(
        yield* service.handle(get(server.paths.metadata)),
        Schema.Struct({
          client_id_metadata_document_supported: Schema.Boolean,
          authorization_response_iss_parameter_supported: Schema.Boolean,
        }),
      );

      expect(discovery).toEqual({
        client_id_metadata_document_supported: true,
        authorization_response_iss_parameter_supported: true,
      });
      const flow = yield* authorize("alice", "read", { client_id: metadataId });

      expect(flow.html).toContain("Remote &lt;assistant&gt;");
      expect(flow.html).toContain("client.example.com");

      const wrong = yield* flow.service.handle(
        remoteExchange(flow.code, { code_verifier: "x".repeat(43) }),
      );

      expect(wrong.status).toBe(400);
      const response = yield* flow.service.handle(remoteExchange(flow.code));

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const tokens = yield* body(response, Tokens);
      const access = yield* service.verify(Redacted.make(tokens.access_token));

      expect(access.clientId).toBe(metadataId);
      expect(access.subjectId).toBe("alice");

      const rotated = yield* body(
        yield* service.handle(
          post(server.paths.token, {
            grant_type: "refresh_token",
            client_id: metadataId,
            resource,
            refresh_token: tokens.refresh_token,
          }),
        ),
        Tokens,
      );

      expect((yield* service.verify(Redacted.make(rotated.access_token))).scopes).toEqual(["read"]);
      expect(
        (yield* service.handle(
          post(server.paths.revoke, { client_id: metadataId, token: rotated.refresh_token }),
        )).status,
      ).toBe(200);
      expect(
        Exit.isFailure(yield* Effect.exit(service.verify(Redacted.make(rotated.access_token)))),
      ).toBe(true);
      expect(fetches).toBe(1);
    }).pipe(
      Effect.provide(
        remoteHarness(
          () => {
            fetches++;

            return Response.json(metadata, { headers: { "cache-control": "max-age=60" } });
          },
          { ...metadataConfig, clients: [] },
        ),
      ),
    );
  },
);

it.effect("CIMD rejects invalid documents and never caches failures", () => {
  let document: unknown = metadata;

  return Effect.gen(function* () {
    const service = yield* server.Service;

    for (const invalid of [
      { ...metadata, client_id: `${metadataId}?other` },
      { ...metadata, client_name: undefined },
      { ...metadata, redirect_uris: ["http://public.example/callback"] },
      { ...metadata, token_endpoint_auth_method: "private_key_jwt" },
      { ...metadata, token_endpoint_auth_method: "client_secret_post" },
      { ...metadata, client_secret: "must-not-be-public" },
      { ...metadata, client_secret_expires_at: 0 },
      { ...metadata, grant_types: ["client_credentials"] },
      { ...metadata, response_types: ["token"] },
    ]) {
      document = invalid;
      const response = yield* service.handle(begin());

      expect(response.status).toBe(400);
      expect(response.headers.has("location")).toBe(false);
    }
    document = { ...metadata, extension: "ignored" };
    expect(
      (yield* service.handle(begin({ redirect_uri: "https://other.example/callback" }))).status,
    ).toBe(400);
    expect((yield* service.handle(begin())).status).toBe(303);
  }).pipe(
    Effect.provide(
      remoteHarness(() => Response.json(document, { headers: { "cache-control": "max-age=60" } })),
    ),
  );
});

it.effect(
  "CIMD fetch policy blocks untrusted URLs, redirects, oversized and malformed responses",
  () => {
    let calls = 0;
    let response = () => Response.json(metadata);

    return Effect.gen(function* () {
      const service = yield* server.Service;

      for (const id of [
        "http://client.example.com/client.json",
        "https://client.example.com",
        "https://client.example.com/",
        "https://client.example.com/a/../client.json",
        "https://client.example.com/%2e/client.json",
        "https://user@client.example.com/client.json",
        `${metadataId}#fragment`,
        "https://127.0.0.1/client.json",
        "https://169.254.169.254/client.json",
        "https://elsewhere.example/client.json",
      ])
        expect((yield* service.handle(begin({ client_id: id }))).status).toBe(400);
      expect(calls).toBe(0);
      for (const invalid of [
        () =>
          new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } }),
        () => new Response("not json", { headers: { "content-type": "application/json" } }),
        () => new Response("x".repeat(5121), { headers: { "content-type": "application/json" } }),
        () => Response.json(metadata, { status: 404 }),
      ]) {
        response = invalid;
        expect((yield* service.handle(begin())).status).toBe(400);
      }
      response = () => Response.json(metadata);
      expect((yield* service.handle(begin())).status).toBe(303);
    }).pipe(
      Effect.provide(
        remoteHarness(() => {
          calls++;

          return response();
        }),
      ),
    );
  },
);

it.effect(
  "CIMD honors freshness and no-store and revalidates a changed callback before consent",
  () => {
    let calls = 0;
    let current = metadata;
    let cacheControl = "max-age=2";

    return Effect.gen(function* () {
      const flow = yield* start("alice", "read", { client_id: metadataId });

      expect(calls).toBe(1);
      yield* TestClock.adjust(2000);
      current = { ...metadata, redirect_uris: ["https://client.example.com/changed"] };

      const denied = yield* flow.service.handle(
        post(server.paths.authorize, { csrf: flow.csrf, decision: "approve" }, flow.cookie),
      );

      expect(denied.status).toBe(400);
      expect(denied.headers.has("location")).toBe(false);
      current = metadata;
      cacheControl = "no-store";
      yield* TestClock.adjust(2000);
      expect((yield* flow.service.handle(begin())).status).toBe(303);
      expect((yield* flow.service.handle(begin())).status).toBe(303);
      expect(calls).toBe(4);
    }).pipe(
      Effect.provide(
        remoteHarness(() => {
          calls++;

          return Response.json(current, { headers: { "cache-control": cacheControl } });
        }),
      ),
    );
  },
);

// Regression in 2aa9a55: unread discovery responses were left to GC cleanup.
// Keep bodies open and use FetchHttpClient itself to observe transport cancellation.
it.effect("discovery cancels rejected responses before releasing the request", () => {
  const responses: Response[] = [];
  const signals: Array<AbortSignal | null | undefined> = [];
  let status = 503;
  let contentType = "application/json";

  const fetch: typeof globalThis.fetch = (_input, init) => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(5121));
        },
      }),
      { status, headers: { "content-type": contentType } },
    );

    responses.push(response);
    signals.push(init?.signal);

    return Promise.resolve(response);
  };

  return Effect.gen(function* () {
    const service = yield* server.Service;

    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        for (const response of responses) if (!response.body?.locked) await response.body?.cancel();
      }),
    );
    const cancellations: boolean[] = [];

    for (const response of [
      { status: 503, type: "application/json" },
      { status: 200, type: "text/plain" },
      { status: 200, type: "application/json" },
    ]) {
      status = response.status;
      contentType = response.type;
      expect((yield* service.handle(begin())).status).toBe(400);
      cancellations.push(signals.at(-1)?.aborted ?? false);
    }
    expect(cancellations).toEqual([true, true, true]);
  }).pipe(
    Effect.provide(
      harness(
        undefined,
        metadataConfig,
        FetchHttpClient.layer.pipe(Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch))),
      ),
    ),
  );
});

it.effect("CIMD cancels a stalled metadata request at its deadline", () =>
  Effect.gen(function* () {
    const service = yield* server.Service;
    const fiber = yield* Effect.forkChild(service.handle(begin()));

    yield* TestClock.adjust("5 seconds");
    expect((yield* Fiber.join(fiber)).status).toBe(503);
  }).pipe(
    Effect.provide(
      harness(
        undefined,
        metadataConfig,
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make(() => Effect.never),
        ),
      ),
    ),
  ),
);

it.effect("OAuth 2.1 permits an omitted sole callback and token redirect_uri", () =>
  Effect.gen(function* () {
    const flow = yield* authorize("alice", "read", { redirect_uri: "" });

    const response = yield* flow.service.handle(
      post(server.paths.token, {
        grant_type: "authorization_code",
        client_id: "client",
        resource,
        code: flow.code,
        code_verifier: verifier,
      }),
    );

    expect(response.status).toBe(200);
  }).pipe(Effect.provide(harness())),
);

it.effect(
  "native loopback redirects allow variable ports but bind the code to the actual callback",
  () =>
    Effect.gen(function* () {
      const flow = yield* authorize("alice", "read", {
        redirect_uri: "http://127.0.0.1:49152/callback",
      });

      const response = yield* flow.service.handle(
        post(server.paths.token, {
          grant_type: "authorization_code",
          client_id: "client",
          resource,
          code: flow.code,
          code_verifier: verifier,
          redirect_uri: "http://127.0.0.1:49153/callback",
        }),
      );

      expect(response.status).toBe(400);
      expect(
        (yield* flow.service.handle(
          post(server.paths.token, {
            grant_type: "authorization_code",
            client_id: "client",
            resource,
            code: flow.code,
            code_verifier: verifier,
            redirect_uri: "http://127.0.0.1:49152/callback",
          }),
        )).status,
      ).toBe(200);
    }).pipe(
      Effect.provide(
        harness(undefined, {
          ...config,
          clients: [
            {
              clientId: "client",
              name: "Native",
              applicationType: "native",
              redirectUris: ["http://127.0.0.1/callback"],
            },
          ],
        }),
      ),
    ),
);

it.effect("confidential clients must authenticate code exchange, refresh, and revocation", () =>
  Effect.gen(function* () {
    const flow = yield* authorize();

    expect((yield* flow.service.handle(exchange(flow.code))).status).toBe(400);
    const credentials = { client_id: "client", client_secret: "private-client-secret" };

    const exchanged = yield* flow.service.handle(
      post(server.paths.token, {
        ...credentials,
        grant_type: "authorization_code",
        resource,
        code: flow.code,
        code_verifier: verifier,
      }),
    );

    expect(exchanged.status).toBe(200);
    const tokens = yield* body(exchanged, Tokens);

    expect((yield* flow.service.handle(refresh(tokens.refresh_token))).status).toBe(400);
    expect(
      (yield* flow.service.handle(
        post(server.paths.revoke, { client_id: "client", token: tokens.access_token }),
      )).status,
    ).toBe(400);

    const basic = post(server.paths.token, {
      grant_type: "refresh_token",
      resource,
      refresh_token: tokens.refresh_token,
    });

    basic.headers.set("authorization", `Basic ${btoa("client:private-client-secret")}`);
    const rotated = yield* body(yield* flow.service.handle(basic), Tokens);
    const bad = post(server.paths.revoke, { token: rotated.access_token });

    bad.headers.set("authorization", `Basic ${btoa("client:wrong")}`);
    const rejected = yield* flow.service.handle(bad);

    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("www-authenticate")).toContain("Basic");
    expect(
      (yield* flow.service.handle(
        post(server.paths.revoke, { ...credentials, token: rotated.access_token }),
      )).status,
    ).toBe(200);
    expect(
      Exit.isFailure(yield* Effect.exit(flow.service.verify(Redacted.make(rotated.access_token)))),
    ).toBe(true);
  }).pipe(
    Effect.provide(
      harness(undefined, {
        ...config,
        clients: [
          {
            ...config.clients[0],
            clientSecret: Redacted.make("private-client-secret"),
          },
        ],
      }),
    ),
  ),
);

it.effect("root resource metadata is discoverable", () =>
  Effect.gen(function* () {
    const service = yield* server.Service;

    expect(service.resourceMetadata).toBe(`${origin}/.well-known/oauth-protected-resource`);
    const response = yield* service.handle(get("/.well-known/oauth-protected-resource"));

    expect(response.status).toBe(200);
    expect(yield* body(response, Schema.Struct({ resource: Schema.String }))).toEqual({
      resource: origin,
    });
  }).pipe(Effect.provide(harness(undefined, { ...config, resource: origin }))),
);

it.effect("CIMD does not reuse responses forbidden by shared-cache directives", () => {
  let calls = 0;
  let headers: Record<string, string> = {};

  return Effect.gen(function* () {
    const service = yield* server.Service;

    for (const policy of [
      { "cache-control": "max-age=60, max-age=0" },
      { "cache-control": "max-age=60, private" },
      { "cache-control": "max-age=60", vary: "*" },
      { "cache-control": "max-age=60, s-maxage=0" },
      { "cache-control": "max-age=60", age: "60" },
    ]) {
      headers = policy;
      const before = calls;

      expect((yield* service.handle(begin())).status).toBe(303);
      expect((yield* service.handle(begin())).status).toBe(303);
      expect(calls - before).toBe(2);
    }
  }).pipe(
    Effect.provide(
      remoteHarness(() => {
        calls++;

        return Response.json(metadata, { headers });
      }),
    ),
  );
});

it.effect(
  "authorization ignores unknown extensions but rejects duplicate recognized parameters",
  () =>
    Effect.gen(function* () {
      const service = yield* server.Service;
      const request = begin({ client_id: "client" });
      const duplicate = new URL(request.url);

      duplicate.searchParams.append("client_id", "");
      expect((yield* service.handle(new Request(duplicate))).status).toBe(400);
      const extension = new URL(request.url);

      extension.searchParams.append("extension", "one");
      extension.searchParams.append("extension", "two");
      expect((yield* service.handle(new Request(extension))).status).toBe(303);
    }).pipe(Effect.provide(harness())),
);

it.effect("CIMD rejects a client ID without an HTTPS authority delimiter", () =>
  Effect.gen(function* () {
    const service = yield* server.Service;

    expect(
      (yield* service.handle(begin({ client_id: "https:client.example.com/oauth/client.json" })))
        .status,
    ).toBe(400);
  }).pipe(
    Effect.provide(
      remoteHarness(() =>
        Response.json({ ...metadata, client_id: "https:client.example.com/oauth/client.json" }),
      ),
    ),
  ),
);

it.effect("authorization errors return to a validated callback with state and issuer", () =>
  Effect.gen(function* () {
    const service = yield* server.Service;

    for (const [input, error] of [
      [{ response_type: "token" }, "unsupported_response_type"],
      [{ scope: "unknown" }, "invalid_scope"],
      [{ resource: "https://app.example.com/other" }, "invalid_target"],
    ] as const) {
      const response = yield* service.handle(
        begin({ client_id: "client", state: "error-state", ...input }),
      );

      expect(response.status).toBe(303);
      const callback = new URL(response.headers.get("location")!);

      expect(callback.origin + callback.pathname).toBe(redirectUri);
      expect(callback.searchParams.get("error")).toBe(error);
      expect(callback.searchParams.get("state")).toBe("error-state");
      expect(callback.searchParams.get("iss")).toBe(origin);
      expect(callback.searchParams.has("code")).toBe(false);
    }

    const invalid = yield* service.handle(
      begin({
        client_id: "client",
        redirect_uri: "https://attacker.example/callback",
        scope: "unknown",
      }),
    );

    expect(invalid.status).toBe(400);
    expect(invalid.headers.has("location")).toBe(false);
    const unauthenticated = begin({ client_id: "client", scope: "unknown" });

    unauthenticated.headers.delete("test-user");
    const local = yield* service.handle(unauthenticated);

    expect(local.status).toBe(400);
    expect(local.headers.has("location")).toBe(false);
  }).pipe(Effect.provide(harness())),
);

// User-requested private_key_jwt proof: real JOSE + SQLite, with only remote
// documents, time, and a lost persistence acknowledgment under test control.
const assertionType = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const jwksUri = "https://client.example.com/keys.json";

const signingKeys = Effect.gen(function* () {
  const pair = yield* Effect.promise(() =>
    globalThis.crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]),
  );

  const publicKey = yield* Effect.promise(() =>
    globalThis.crypto.subtle.exportKey("jwk", pair.publicKey),
  );

  const privateKey = yield* Effect.promise(() =>
    globalThis.crypto.subtle.exportKey("jwk", pair.privateKey),
  );

  const key = yield* Jwk.importPrivate(Redacted.make(privateKey), "ES256");
  const jwk = yield* Schema.decodeUnknownEffect(Jwk.PublicJwk)({ ...publicKey, kid: "client-key" });

  return { key, jwks: { keys: [jwk] } };
});

const assertion = Effect.fnUntraced(function* (
  key: Jwk.SigningKey,
  jti: string,
  claims: { readonly [K in keyof Jwt.RegisteredClaims]?: Jwt.RegisteredClaims[K] | undefined } = {},
  clientId = metadataId,
) {
  const now = Math.floor((yield* Clock.currentTimeMillis) / 1000);

  const payload = yield* Schema.decodeEffect(Jwt.RegisteredClaims)(
    Object.fromEntries(
      Object.entries({
        iss: clientId,
        sub: clientId,
        aud: `${origin}${server.paths.token}`,
        exp: now + 60,
        jti,
        ...claims,
      }).filter(([, value]) => value !== undefined),
    ),
  );

  const jwt = yield* Jwt.sign(Jwt.RegisteredClaims, payload, key, {
    alg: key.algorithm === "dir" ? "HS256" : key.algorithm,
    kid: "client-key",
  });

  return { client_assertion_type: assertionType, client_assertion: Redacted.value(jwt) };
});

it.effect("private_key_jwt CIMD authenticates exchange, refresh and revocation", () => {
  let jwks: unknown;
  let keyFetches = 0;

  return Effect.gen(function* () {
    const keys = yield* signingKeys;

    jwks = keys.jwks;
    const service = yield* server.Service;

    const discovery = yield* body(
      yield* service.handle(get(server.paths.metadata)),
      Schema.Struct({
        token_endpoint_auth_methods_supported: Schema.Array(Schema.String),
        token_endpoint_auth_signing_alg_values_supported: Schema.Array(Schema.String),
      }),
    );

    expect(discovery.token_endpoint_auth_methods_supported).toContain("private_key_jwt");
    expect(discovery.token_endpoint_auth_signing_alg_values_supported).toContain("RS256");
    const flow = yield* authorize("alice", "read", { client_id: metadataId });

    expect((yield* service.handle(remoteExchange(flow.code))).status).toBe(400);

    const tokens = yield* body(
      yield* service.handle(remoteExchange(flow.code, yield* assertion(keys.key, "exchange"))),
      Tokens,
    );

    const rotated = yield* body(
      yield* service.handle(
        post(server.paths.token, {
          grant_type: "refresh_token",
          resource,
          refresh_token: tokens.refresh_token,
          ...(yield* assertion(keys.key, "refresh", { aud: origin })),
        }),
      ),
      Tokens,
    );

    expect(
      (yield* service.handle(
        post(server.paths.revoke, {
          token: rotated.access_token,
          ...(yield* assertion(keys.key, "revoke", { aud: `${origin}${server.paths.revoke}` })),
        }),
      )).status,
    ).toBe(200);
    expect(
      Exit.isFailure(yield* Effect.exit(service.verify(Redacted.make(rotated.access_token)))),
    ).toBe(true);
    expect(keyFetches).toBe(1);
  }).pipe(
    Effect.provide(
      remoteHarness((url) => {
        if (url === jwksUri) keyFetches++;

        return Response.json(
          url === jwksUri
            ? jwks
            : {
                ...metadata,
                token_endpoint_auth_method: "private_key_jwt",
                jwks_uri: jwksUri,
              },
          { headers: { "cache-control": "max-age=60" } },
        );
      }),
    ),
  );
});

it.effect(
  "private_key_jwt binds static clients, claims, algorithms and authentication methods",
  () =>
    Effect.gen(function* () {
      const keys = yield* signingKeys;
      const other = yield* signingKeys;

      const symmetric = yield* Jwk.importSecret(
        Redacted.make({ kty: "oct", k: Base64Url.encode(new Uint8Array(32).fill(7)) }),
        "HS256",
      );

      const now = Math.floor((yield* Clock.currentTimeMillis) / 1000);

      const options = {
        ...config,
        clients: [{ ...config.clients[0], clientAssertion: { jwks: keys.jwks } }],
      };

      yield* Effect.gen(function* () {
        const service = yield* server.Service;

        const send = (credentials: Record<string, string>) =>
          service.handle(
            post(server.paths.revoke, { client_id: "client", token: "unknown", ...credentials }),
          );

        expect((yield* send({})).status).toBe(400);
        for (const claims of [
          { iss: "other" },
          { sub: "other" },
          { aud: "https://other.example" },
          { exp: now },
          { exp: undefined },
          { exp: now + 301 },
          { nbf: now + 30 },
          { iat: now + 30 },
          { jti: undefined },
        ]) {
          const response = yield* send(
            yield* assertion(keys.key, "invalid-claims", claims, "client"),
          );

          expect(response.status).toBe(400);
          expect(yield* body(response, Schema.Struct({ error: Schema.String }))).toEqual({
            error: "invalid_client",
          });
        }
        for (const key of [other.key, symmetric])
          expect((yield* send(yield* assertion(key, "wrong-key", {}, "client"))).status).toBe(400);
        const valid = yield* assertion(keys.key, "valid", {}, "client");

        expect((yield* send({ ...valid, client_secret: "mixed" })).status).toBe(400);
        expect((yield* send({ ...valid, client_assertion_type: "wrong" })).status).toBe(400);
        const basic = post(server.paths.revoke, { token: "unknown", ...valid });

        basic.headers.set("authorization", `Basic ${btoa("client:mixed")}`);
        expect((yield* service.handle(basic)).status).toBe(400);
        expect((yield* send(valid)).status).toBe(200);
      }).pipe(Effect.provide(harness(undefined, options)));
    }).pipe(Effect.provide(cryptoLayer)),
);

it.effect(
  "private_key_jwt replay receipts survive races, new server Layers and lost acknowledgments",
  () =>
    Effect.gen(function* () {
      const keys = yield* signingKeys;

      const options = {
        ...config,
        clients: [{ ...config.clients[0], clientAssertion: { jwks: keys.jwks } }],
      };

      yield* Effect.gen(function* () {
        const store = yield* OAuthServer.Persistence;
        const service = yield* server.Service;
        const signed = yield* assertion(keys.key, "race", {}, "client");

        const request = () =>
          post(server.paths.revoke, { client_id: "client", token: "unknown", ...signed });

        const raced = yield* Effect.all([service.handle(request()), service.handle(request())], {
          concurrency: 2,
        });

        expect(raced.map((response) => response.status).sort()).toEqual([200, 400]);

        const fresh = server
          .layer(options)
          .pipe(
            Layer.provide(Layer.succeed(server.Identity, { current: Effect.succeed(undefined) })),
            Layer.provide(FetchHttpClient.layer),
          );

        const again = yield* Effect.gen(function* () {
          return yield* (yield* server.Service).handle(request());
        }).pipe(Effect.provide(fresh));

        expect(again.status).toBe(400);

        const lost = yield* assertion(keys.key, "lost-ack", {}, "client");

        const lostRequest = () =>
          post(server.paths.revoke, { client_id: "client", token: "unknown", ...lost });

        const failed = yield* Effect.gen(function* () {
          return yield* (yield* server.Service).handle(lostRequest());
        }).pipe(
          Effect.provide(fresh),
          Effect.provideService(OAuthServer.Persistence, {
            ...store,
            consumeAssertion: (namespace, receipt) =>
              store
                .consumeAssertion(namespace, receipt)
                .pipe(Effect.andThen(OAuthServer.Unavailable.make({}))),
          }),
        );

        expect(failed.status).toBe(503);
        expect((yield* service.handle(lostRequest())).status).toBe(400);
        expect(
          (yield* service.handle(
            post(server.paths.revoke, {
              client_id: "client",
              token: "unknown",
              ...(yield* assertion(keys.key, "fresh", {}, "client")),
            }),
          )).status,
        ).toBe(200);
      }).pipe(Effect.provide(harness(undefined, options)));
    }).pipe(Effect.provide(cryptoLayer)),
);

it.effect("private_key_jwt validates CIMD key sources and refreshes expired JWKS", () => {
  let document: unknown;
  let keySet: unknown;
  const fetched: string[] = [];

  return Effect.gen(function* () {
    const keys = yield* signingKeys;
    const rotated = yield* signingKeys;

    keySet = keys.jwks;
    const service = yield* server.Service;
    const signed = yield* assertion(keys.key, "key-policy");

    const send = (credentials = signed) =>
      service.handle(
        post(server.paths.revoke, { client_id: metadataId, token: "unknown", ...credentials }),
      );

    const confidential = { ...metadata, token_endpoint_auth_method: "private_key_jwt" };

    for (const fields of [
      { jwks_uri: "https://attacker.example/keys" },
      { jwks_uri: "https://127.0.0.1/keys" },
      { jwks_uri: jwksUri, jwks: keys.jwks },
      { jwks: { keys: [{ kty: "oct", k: "secret" }] } },
      { jwks: { keys: [{ ...keys.jwks.keys[0], d: "secret" }] } },
    ]) {
      document = { ...confidential, ...fields };
      expect((yield* send()).status).toBe(400);
    }
    expect(fetched.every((url) => url === metadataId)).toBe(true);
    document = { ...confidential, jwks: keys.jwks, token_endpoint_auth_signing_alg: "RS256" };
    expect((yield* send()).status).toBe(400);
    document = { ...confidential, jwks: keys.jwks };
    expect((yield* send()).status).toBe(200);
    document = { ...confidential, jwks_uri: jwksUri };
    expect((yield* send(yield* assertion(keys.key, "before-rotation"))).status).toBe(200);
    keySet = rotated.jwks;
    yield* TestClock.adjust("2 seconds");
    expect((yield* send(yield* assertion(keys.key, "retired"))).status).toBe(400);
    expect((yield* send(yield* assertion(rotated.key, "rotated"))).status).toBe(200);
    expect(fetched.filter((url) => url === jwksUri)).toHaveLength(2);
  }).pipe(
    Effect.provide(
      remoteHarness((url) => {
        fetched.push(url);

        return Response.json(url === jwksUri ? keySet : document, {
          headers: { "cache-control": url === jwksUri ? "max-age=1" : "no-store" },
        });
      }),
    ),
  );
});
