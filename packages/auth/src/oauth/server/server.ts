import {
  Cause,
  Context,
  Crypto,
  DateTime,
  Duration,
  Effect,
  Layer,
  Redacted,
  Schema,
  Stream,
} from "effect";
import { Base64Url } from "effect/encoding";
import { Cookies, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { HttpApiBuilder, HttpApiSecurity } from "effect/http-api";

import { cryptoLayer } from "../../auth/defaults";
import { reportAuthFailure } from "../../internal/diagnostics";
import { origin as Origin } from "../../internal/origin";
import { SubjectId } from "../../Schema";
import { makeSessionSigningCodec, type SessionSigningKeyring } from "../../sessions/crypto";
import {
  Access,
  Authorization,
  AuthorizationMetadata,
  Client,
  ConfigurationError,
  CurrentAccess,
  InvalidToken,
  Persistence,
  Random,
  ResourceMetadata,
  Scopes,
  Text,
  TokenResponse,
  Unavailable,
  type Record,
} from "./models";

class Rejected extends Schema.TaggedError<Rejected>()("OAuthServerRejected", {
  error: Schema.Literals([
    "invalid_request",
    "invalid_client",
    "invalid_grant",
    "invalid_scope",
    "unsupported_grant_type",
    "access_denied",
  ]),
}) {}
const reject = (error: Rejected["error"] = "invalid_request") => Rejected.make({ error });
const now = DateTime.now.pipe(Effect.map(DateTime.toEpochMillis));

const noStore = {
  "cache-control": "no-store",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
};

const json = (value: Schema.Json, status = 200) =>
  Response.json(value, { status, headers: noStore });

const redirect = (location: string) =>
  new Response(null, { status: 303, headers: { ...noStore, location } });

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const Url = Text.check(
  Schema.makeFilter((text) => {
    try {
      const url = new URL(text);

      return (
        !url.username &&
        !url.password &&
        !text.includes("#") &&
        !/[\s\\]/.test(text) &&
        (url.protocol === "https:" ||
          (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
      );
    } catch {
      return false;
    }
  }),
);

const LoginPath = Text.check(Schema.isPattern(/^\/(?!\/)[^?#\\\s]*$/));

const AuthorizeQuery = Schema.Struct({
  response_type: Schema.Literal("code"),
  client_id: Text,
  redirect_uri: Url,
  resource: Url,
  scope: Text,
  code_challenge: Random,
  code_challenge_method: Schema.Literal("S256"),
  state: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2048))),
});

const TokenRequest = Schema.Union([
  Schema.Struct({
    grant_type: Schema.Literal("authorization_code"),
    client_id: Text,
    resource: Url,
    code: Text,
    redirect_uri: Url,
    code_verifier: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9._~-]{43,128}$/)),
  }),
  Schema.Struct({
    grant_type: Schema.Literal("refresh_token"),
    client_id: Text,
    resource: Url,
    refresh_token: Text,
    scope: Schema.optionalKey(Text),
  }),
]);

const Decision = Schema.Struct({ csrf: Random, decision: Schema.Literals(["approve", "deny"]) });

const Revocation = Schema.Struct({
  client_id: Text,
  token: Text,
  token_type_hint: Schema.optionalKey(Text),
});

const parameters = Effect.fnUntraced(function* (params: URLSearchParams) {
  const entries: { [key: string]: string } = Object.create(null);

  for (const [key, value] of params) {
    if (Object.hasOwn(entries, key)) return yield* reject();
    entries[key] = value;
  }

  return entries;
});

const form = Effect.fnUntraced(function* (request: HttpServerRequest.HttpServerRequest) {
  if (
    request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
    "application/x-www-form-urlencoded"
  )
    return yield* reject();
  const decoder = new TextDecoder();

  const body = yield* request.stream.pipe(
    Stream.runFoldEffect(
      () => ({ text: "", bytes: 0 }),
      (body, chunk) =>
        body.bytes + chunk.length > 16384
          ? Effect.fail(reject())
          : Effect.succeed({
              text: body.text + decoder.decode(chunk, { stream: true }),
              bytes: body.bytes + chunk.length,
            }),
    ),
    Effect.mapError(() => reject()),
  );

  return yield* parameters(new URLSearchParams(body.text + decoder.decode()));
});

const scopeList = (text: string) =>
  Schema.decodeUnknownEffect(Scopes)(text.split(" ")).pipe(
    Effect.mapError(() => reject("invalid_scope")),
  );

export interface Options {
  /** One authorization server per origin. HTTP is accepted only for loopback development. */
  readonly origin: string;
  readonly resource: string;
  readonly clients: ReadonlyArray<Client>;
  /** Login must return to paths.authorize. Pending authorization stays in a private cookie. */
  readonly loginPath: string;
  readonly keys: SessionSigningKeyring;
}

/** Authorization-code server for explicitly registered public clients. The
 * application supplies identity; Effect owns the MCP protocol and transport.
 * Token rotation uses a single durable CAS. A lost commit response never
 * permits replaying issuance: the client must start authorization again.
 */
export const make = <const Id extends string>(
  id: Id,
  input: { readonly scopes: readonly [string, ...string[]] },
) => {
  const scopes = [...input.scopes];

  const paths = {
    authorize: `/oauth/${id}/authorize`,
    token: `/oauth/${id}/token`,
    revoke: `/oauth/${id}/revoke`,
    metadata: "/.well-known/oauth-authorization-server",
  } as const;

  const Identity = Context.Service<
    { readonly server: Id; readonly kind: "identity" },
    {
      /** Verify the application's session on every consent GET and POST. Returning
       * undefined redirects GET to login; POST fails closed. Never infer identity
       * from MCP client metadata, query parameters or provider profile fields.
       */
      readonly current: Effect.Effect<
        SubjectId | undefined,
        Unavailable,
        HttpServerRequest.HttpServerRequest
      >;
    }
  >()(`effect-auth/OAuthServer/${id}/Identity`);

  const Service = Context.Service<
    { readonly server: Id; readonly kind: "server" },
    {
      readonly handle: (request: Request) => Effect.Effect<Response>;
      readonly verify: (
        token: Redacted.Redacted<string>,
      ) => Effect.Effect<Access, InvalidToken | Unavailable>;
      /** Trusted application operation, e.g. disabling an account or connection. */
      readonly revoke: (grantId: string) => Effect.Effect<void, Unavailable>;
      readonly resource: string;
      readonly resourceMetadata: string;
      /** Exact name for this configured origin, including the HTTPS host prefix. */
      readonly cookieName: string;
    }
  >()(`effect-auth/OAuthServer/${id}`);

  const layer = (options: Options) =>
    Layer.effect(
      Service,
      Effect.gen(function* () {
        const config = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            id: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,47}$/)),
            origin: Origin.check(Schema.isMaxLength(256)),
            resource: Url.check(Schema.isMaxLength(512)),
            clients: Schema.NonEmptyArray(Client),
            loginPath: LoginPath,
            scopes: Scopes,
          }),
        )({
          ...options,
          id,
          scopes,
          clients: options.clients.map((client) => ({
            ...client,
            redirectUris: [...client.redirectUris],
          })),
        }).pipe(Effect.mapError(() => ConfigurationError.make({})));

        const secure = config.origin.startsWith("https:");
        const cookieName = `${secure ? "__Host-" : ""}yielded-${id}-consent`;
        const resourceUrl = new URL(config.resource);

        if (
          resourceUrl.href !== config.resource ||
          resourceUrl.origin !== config.origin ||
          resourceUrl.search ||
          resourceUrl.pathname === "/" ||
          config.loginPath === paths.authorize ||
          new Set(config.clients.map((client) => client.clientId)).size !== config.clients.length ||
          new Set(scopes).size !== scopes.length
        )
          return yield* ConfigurationError.make({});
        for (const client of config.clients)
          for (const uri of client.redirectUris) {
            yield* Schema.decodeUnknownEffect(Url)(uri).pipe(
              Effect.mapError(() => ConfigurationError.make({})),
            );
            const url = new URL(uri);

            if (["code", "state", "iss", "error"].some((key) => url.searchParams.has(key)))
              return yield* ConfigurationError.make({});
          }
        const store = yield* Persistence;
        const identity = yield* Identity;
        const crypto = yield* Crypto.Crypto;
        const namespace = `${config.origin}/oauth/${id}`;
        const resourceMetadataPath = `/.well-known/oauth-protected-resource${resourceUrl.pathname}`;
        const resourceMetadata = `${config.origin}${resourceMetadataPath}`;

        const Envelope = Schema.Struct({
          purpose: Schema.Literal("oauth-server/v1"),
          issuer: Schema.Literal(config.origin),
          server: Schema.Literal(id),
          resource: Schema.Literal(config.resource),
          kind: Schema.Literals(["consent", "code", "access", "refresh"]),
          grantId: Random,
          version: Random,
          expiresAtMillis: Schema.Natural,
        });

        type Envelope = typeof Envelope.Type;

        const codec = yield* makeSessionSigningCodec(Envelope, options.keys, 2048).pipe(
          Effect.mapError(() => ConfigurationError.make({})),
        );

        const random = crypto.randomBytes(32).pipe(
          Effect.map(Base64Url.encode),
          Effect.mapError(() => Unavailable.make({})),
        );

        const encode = (
          kind: Envelope["kind"],
          grantId: string,
          version: string,
          expiresAtMillis: number,
        ) =>
          codec
            .encode({
              purpose: "oauth-server/v1",
              issuer: config.origin,
              server: id,
              resource: config.resource,
              kind,
              grantId,
              version,
              expiresAtMillis,
            })
            .pipe(Effect.mapError(() => Unavailable.make({})));

        const decode = Effect.fnUntraced(function* (token: Redacted.Redacted<string>) {
          const value = yield* codec.decode(token).pipe(
            Effect.catchTags({
              SessionInvalid: () => Effect.fail(InvalidToken.make({})),
              SessionUnavailable: () => Effect.fail(Unavailable.make({})),
            }),
          );

          if (value.expiresAtMillis <= (yield* now)) return yield* InvalidToken.make({});

          return value;
        });

        const clientFor = (clientId: string) =>
          Effect.fromNullishOr(config.clients.find((c) => c.clientId === clientId)).pipe(
            Effect.mapError(() => reject("invalid_client")),
          );

        const validGrant = (record: Record) =>
          config.clients.some(
            (c) =>
              c.clientId === record.authorization.clientId &&
              c.redirectUris.includes(record.authorization.redirectUri),
          ) && record.authorization.scopes.every((scope) => config.scopes.includes(scope));

        const read = Effect.fnUntraced(function* (token: Envelope) {
          const record = yield* store.get(namespace, token.grantId);

          if (
            !record ||
            record.status === "Revoked" ||
            record.expiresAtMillis <= (yield* now) ||
            !validGrant(record)
          )
            return yield* InvalidToken.make({});

          return record;
        });

        const commit = Effect.fnUntraced(function* (
          grantId: string,
          before: Record,
          after: Record,
        ) {
          if (!(yield* store.compareAndSet(namespace, grantId, before.version, after)))
            return yield* reject("invalid_grant");
        });

        const cookie = (credential: string, maxAge: number) =>
          Cookies.serializeCookie(
            Cookies.makeCookieUnsafe(cookieName, credential, {
              path: secure ? "/" : paths.authorize,
              httpOnly: true,
              sameSite: "lax",
              secure,
              maxAge: Duration.seconds(maxAge),
            }),
          );

        const callback = (
          authorization: Authorization,
          values: { code: string } | { error: string },
        ) => {
          const url = new URL(authorization.redirectUri);

          for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
          url.searchParams.set("iss", config.origin);
          if (authorization.state !== undefined) url.searchParams.set("state", authorization.state);
          const response = redirect(url.href);

          response.headers.set("set-cookie", cookie("", 0));

          return response;
        };

        const verify = Effect.fn("OAuthServer.verify")(function* (
          credential: Redacted.Redacted<string>,
        ) {
          const token = yield* decode(credential);

          if (token.kind !== "access") return yield* InvalidToken.make({});
          const record = yield* read(token);

          if (
            record.status !== "Active" ||
            record.version !== token.version ||
            record.subjectId === undefined
          )
            return yield* InvalidToken.make({});

          return Access.make({
            subjectId: record.subjectId,
            grantId: token.grantId,
            clientId: record.authorization.clientId,
            resource: config.resource,
            scopes: record.authorization.scopes,
          });
        });

        const handle = Effect.fn("OAuthServer.handle")(
          function* (web: Request) {
            const url = new URL(web.url);

            if (url.origin !== config.origin) return json({ error: "invalid_request" }, 400);
            const request = HttpServerRequest.fromWeb(web);

            if (web.method === "GET" && url.pathname === paths.metadata)
              return json(
                AuthorizationMetadata.make({
                  issuer: config.origin,
                  authorization_endpoint: `${config.origin}${paths.authorize}`,
                  token_endpoint: `${config.origin}${paths.token}`,
                  revocation_endpoint: `${config.origin}${paths.revoke}`,
                  response_types_supported: ["code"],
                  grant_types_supported: ["authorization_code", "refresh_token"],
                  token_endpoint_auth_methods_supported: ["none"],
                  revocation_endpoint_auth_methods_supported: ["none"],
                  code_challenge_methods_supported: ["S256"],
                  authorization_response_iss_parameter_supported: true,
                  scopes_supported: config.scopes,
                }),
              );
            if (web.method === "GET" && url.pathname === resourceMetadataPath)
              return json(
                ResourceMetadata.make({
                  resource: config.resource,
                  authorization_servers: [config.origin],
                  scopes_supported: config.scopes,
                  bearer_methods_supported: ["header"],
                }),
              );
            if (
              url.pathname === paths.authorize &&
              (web.method === "GET" || web.method === "POST")
            ) {
              if (web.method === "GET" && url.search !== "") {
                const query = yield* parameters(url.searchParams).pipe(
                  Effect.flatMap(Schema.decodeUnknownEffect(AuthorizeQuery)),
                  Effect.mapError(() => reject()),
                );

                const client = yield* clientFor(query.client_id);

                if (
                  !client.redirectUris.includes(query.redirect_uri) ||
                  query.resource !== config.resource
                )
                  return yield* reject();
                const requested = yield* scopeList(query.scope);

                if (!requested.every((scope) => config.scopes.includes(scope)))
                  return yield* reject("invalid_scope");
                const grantId = yield* random;
                const version = yield* random;
                const expiresAtMillis = (yield* now) + 300_000;

                const authorization = Authorization.make({
                  clientId: client.clientId,
                  redirectUri: query.redirect_uri,
                  scopes: requested,
                  challenge: query.code_challenge,
                  ...(query.state === undefined ? {} : { state: query.state }),
                });

                const credential = yield* encode("consent", grantId, version, expiresAtMillis);

                if (
                  !(yield* store.insert(namespace, grantId, {
                    status: "Pending",
                    version,
                    authorization,
                    expiresAtMillis,
                  }))
                )
                  return yield* Unavailable.make({});
                const response = redirect(paths.authorize);

                response.headers.set("set-cookie", cookie(Redacted.value(credential), 300));

                return response;
              }
              const credential = request.cookies[cookieName];

              if (credential === undefined) return yield* reject();
              const token = yield* decode(Redacted.make(credential));
              let record = yield* read(token);

              if (
                token.kind !== "consent" ||
                (record.status !== "Pending" && record.status !== "Consent")
              )
                return yield* reject();

              const subjectId = yield* identity.current.pipe(
                Effect.provideService(HttpServerRequest.HttpServerRequest, request),
              );

              if (subjectId === undefined)
                return web.method === "GET"
                  ? redirect(config.loginPath)
                  : yield* reject("access_denied");
              yield* Schema.decodeUnknownEffect(SubjectId)(subjectId).pipe(
                Effect.mapError(() => Unavailable.make({})),
              );
              if (web.method === "GET") {
                if (record.subjectId !== subjectId) {
                  const next: Record = {
                    ...record,
                    status: "Consent",
                    subjectId,
                    version: yield* random,
                  };

                  yield* commit(token.grantId, record, next);
                  record = next;
                }
                const client = yield* clientFor(record.authorization.clientId);

                return new Response(
                  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize access</title><main><h1>Allow ${escape(client.name)}?</h1><p>Access to ${escape(config.resource)} as ${escape(subjectId)}.</p><ul>${record.authorization.scopes.map((scope) => `<li>${escape(scope)}</li>`).join("")}</ul><p>Return to ${escape(new URL(record.authorization.redirectUri).host)}.</p><form method="post" action="${paths.authorize}"><input type="hidden" name="csrf" value="${record.version}"><button name="decision" value="approve">Allow</button><button name="decision" value="deny">Deny</button></form></main></html>`,
                  {
                    headers: {
                      ...noStore,
                      "content-type": "text/html; charset=utf-8",
                      // Native form navigation needs its same-origin Origin header.
                      // The clean consent URL carries no authorization parameters.
                      "referrer-policy": "same-origin",
                      // Browsers also apply form-action to the post-consent redirect.
                      "content-security-policy": `default-src 'none'; form-action 'self' ${new URL(record.authorization.redirectUri).origin}; frame-ancestors 'none'; base-uri 'none'`,
                      "x-frame-options": "DENY",
                      "x-content-type-options": "nosniff",
                    },
                  },
                );
              }
              if (
                web.headers.get("origin") !== config.origin ||
                record.status !== "Consent" ||
                record.subjectId !== subjectId
              )
                return yield* reject("access_denied");

              const decision = yield* form(request).pipe(
                Effect.flatMap(Schema.decodeUnknownEffect(Decision)),
                Effect.mapError(() => reject()),
              );

              // An account switch invalidates forms rendered for the previous subject.
              if (decision.csrf !== record.version) return yield* reject("access_denied");
              if (decision.decision === "deny") {
                yield* store.revoke(namespace, token.grantId);

                return callback(record.authorization, { error: "access_denied" });
              }

              const next: Record = {
                ...record,
                status: "Code",
                version: yield* random,
                expiresAtMillis: (yield* now) + 60_000,
              };

              const code = yield* encode("code", token.grantId, next.version, next.expiresAtMillis);

              yield* commit(token.grantId, record, next);

              return callback(record.authorization, { code: Redacted.value(code) });
            }
            if (web.method === "POST" && url.pathname === paths.token) {
              const body = yield* form(request);

              if (body.grant_type !== "authorization_code" && body.grant_type !== "refresh_token")
                return yield* reject("unsupported_grant_type");

              const query = yield* Schema.decodeUnknownEffect(TokenRequest)(body).pipe(
                Effect.mapError(() => reject()),
              );

              yield* clientFor(query.client_id);
              if (query.resource !== config.resource || web.headers.has("authorization"))
                return yield* reject();

              const token = yield* decode(
                Redacted.make(
                  query.grant_type === "authorization_code" ? query.code : query.refresh_token,
                ),
              );

              const expected = query.grant_type === "authorization_code" ? "code" : "refresh";

              if (token.kind !== expected) return yield* reject("invalid_grant");
              const record = yield* read(token);

              if (
                record.authorization.clientId !== query.client_id ||
                record.subjectId === undefined
              )
                return yield* reject("invalid_grant");
              if (query.grant_type === "authorization_code") {
                const digest = yield* crypto
                  .digest("SHA-256", new TextEncoder().encode(query.code_verifier))
                  .pipe(
                    Effect.map(Base64Url.encode),
                    Effect.mapError(() => Unavailable.make({})),
                  );

                if (
                  query.redirect_uri !== record.authorization.redirectUri ||
                  digest !== record.authorization.challenge
                )
                  return yield* reject("invalid_grant");
              }
              if (
                record.version !== token.version ||
                record.status !== (expected === "code" ? "Code" : "Active")
              ) {
                // A valid consumed credential identifies a compromised grant family.
                yield* store.revoke(namespace, token.grantId);

                return yield* reject("invalid_grant");
              }

              const requested =
                query.grant_type === "refresh_token" && query.scope !== undefined
                  ? yield* scopeList(query.scope)
                  : record.authorization.scopes;

              if (!requested.every((scope) => record.authorization.scopes.includes(scope)))
                return yield* reject("invalid_scope");
              const time = yield* now;

              const next: Record = {
                ...record,
                status: "Active",
                version: yield* random,
                authorization: { ...record.authorization, scopes: requested },
                expiresAtMillis:
                  expected === "code" ? time + 30 * 86400_000 : record.expiresAtMillis,
              };

              const accessExpiry = Math.min(time + 600_000, next.expiresAtMillis);
              const access = yield* encode("access", token.grantId, next.version, accessExpiry);

              const refresh = yield* encode(
                "refresh",
                token.grantId,
                next.version,
                next.expiresAtMillis,
              );

              // Sign locally before the only commit; deliver credentials only after confirmation.
              yield* commit(token.grantId, record, next).pipe(
                Effect.catchTag("OAuthServerRejected", (error) =>
                  store.revoke(namespace, token.grantId).pipe(Effect.andThen(Effect.fail(error))),
                ),
              );

              return json(
                TokenResponse.make({
                  access_token: Redacted.value(access),
                  token_type: "Bearer",
                  expires_in: Math.floor((accessExpiry - time) / 1000),
                  refresh_token: Redacted.value(refresh),
                  scope: requested.join(" "),
                }),
              );
            }
            if (web.method === "POST" && url.pathname === paths.revoke) {
              const query = yield* form(request).pipe(
                Effect.flatMap(Schema.decodeUnknownEffect(Revocation)),
                Effect.mapError(() => reject()),
              );

              yield* clientFor(query.client_id);

              const token = yield* decode(Redacted.make(query.token)).pipe(
                Effect.catchTag("OAuthServerInvalidToken", () => Effect.succeed(undefined)),
              );

              if (token && (token.kind === "access" || token.kind === "refresh")) {
                const record = yield* store.get(namespace, token.grantId);

                if (record?.authorization.clientId === query.client_id)
                  yield* store.revoke(namespace, token.grantId);
              }

              return new Response(null, { status: 200, headers: noStore });
            }

            return new Response(null, { status: 404, headers: noStore });
          },
          (effect) =>
            effect.pipe(
              Effect.timeout("30 seconds"),
              Effect.catchTags({
                OAuthServerRejected: ({ error }) => Effect.succeed(json({ error }, 400)),
                OAuthServerInvalidToken: () =>
                  Effect.succeed(json({ error: "invalid_grant" }, 400)),
                OAuthServerUnavailable: () =>
                  Effect.succeed(json({ error: "temporarily_unavailable" }, 503)),
              }),
              Effect.catchCause((cause) =>
                Cause.hasInterrupts(cause)
                  ? Effect.interrupt
                  : reportAuthFailure("http", cause).pipe(
                      Effect.as(json({ error: "temporarily_unavailable" }, 503)),
                    ),
              ),
            ),
        );

        return Service.of({
          handle,
          verify,
          revoke: (grantId) => store.revoke(namespace, grantId),
          resource: config.resource,
          resourceMetadata,
          cookieName,
        });
      }),
    ).pipe(Layer.provide(cryptoLayer));

  const routes = Layer.unwrap(
    Effect.gen(function* () {
      const server = yield* Service;

      const handler = Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;

        return HttpServerResponse.fromWeb(
          yield* server.handle(yield* HttpServerRequest.toWeb(request)),
        );
      });

      const route = (path: `/${string}`) => HttpRouter.add("*", path, handler);

      return Layer.mergeAll(
        route(paths.authorize),
        route(paths.token),
        route(paths.revoke),
        route(paths.metadata),
        route(new URL(server.resourceMetadata).pathname as `/${string}`),
      );
    }),
  );

  /** Attach only to protected resource routes; metadata and consent stay public.
   * It does not install, wrap or reimplement an MCP protocol server.
   */
  const middleware = (requiredScopes: readonly string[]) =>
    HttpRouter.middleware(
      Effect.gen(function* () {
        const server = yield* Service;

        if (!requiredScopes.every((scope) => scopes.includes(scope)))
          return yield* ConfigurationError.make({});

        const challenge = (error?: "invalid_token" | "insufficient_scope") =>
          `Bearer resource_metadata="${server.resourceMetadata}", scope="${requiredScopes.join(" ")}"${error ? `, error="${error}"` : ""}`;

        return (httpEffect) =>
          Effect.gen(function* () {
            const credential = yield* HttpApiBuilder.securityDecode(HttpApiSecurity.bearer);

            if (Redacted.value(credential) === "")
              return HttpServerResponse.empty({
                status: 401,
                headers: { ...noStore, "www-authenticate": challenge() },
              });

            const access = yield* server.verify(credential).pipe(
              Effect.timeout("30 seconds"),
              Effect.catchTag("TimeoutError", () => Effect.fail(Unavailable.make({}))),
            );

            if (!requiredScopes.every((scope) => access.scopes.includes(scope)))
              return HttpServerResponse.empty({
                status: 403,
                headers: { ...noStore, "www-authenticate": challenge("insufficient_scope") },
              });

            return yield* Effect.provideService(httpEffect, CurrentAccess, access);
          }).pipe(
            Effect.catchTag("OAuthServerInvalidToken", () =>
              Effect.succeed(
                HttpServerResponse.empty({
                  status: 401,
                  headers: { ...noStore, "www-authenticate": challenge("invalid_token") },
                }),
              ),
            ),
            Effect.catchTag("OAuthServerUnavailable", () =>
              Effect.succeed(HttpServerResponse.empty({ status: 503, headers: noStore })),
            ),
          );
      }),
    );

  return { Service, Identity, layer, routes, middleware, paths };
};
