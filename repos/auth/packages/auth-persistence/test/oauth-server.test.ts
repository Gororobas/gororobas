import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { it } from "@effect/vitest";
import * as OAuthServer from "@yielded/auth/OAuthServer";
import { SubjectId } from "@yielded/auth/Schema";
import { Clock, Effect, Exit, Layer, Redacted, Schema } from "effect";
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai";
import { Base64Url } from "effect/encoding";
import { HttpRouter, HttpServerRequest } from "effect/http";
import { SqlClient } from "effect/sql";
import { expect } from "vite-plus/test";

import { OAuthServerPersistence } from "../src/internal/oauth-server";

const server = OAuthServer.make("mcp", { scopes: ["read", "write"] });
const origin = "https://app.example.com";
const resource = `${origin}/mcp`;
const redirectUri = "https://client.example.com/callback";
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

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

const harness = (fault?: Effect.Effect<void, OAuthServer.Unavailable>) => {
  const database = Layer.effectDiscard(
    Effect.gen(function* () {
      yield* (yield* SqlClient.SqlClient).unsafe(OAuthServerPersistence.migration);
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

  return server.layer(config).pipe(Layer.provide(identity), Layer.provideMerge(durable));
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

const start = (user = "alice", scope = "read") =>
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

    return { service, cookie, csrf: consentToken(html), user };
  });

const authorize = (user = "alice", scope = "read") =>
  Effect.gen(function* () {
    const flow = yield* start(user, scope);

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
    }).pipe(Effect.exit, Effect.provide(otherResource));

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
