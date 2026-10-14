import * as LibsqlClient from "@effect/sql-libsql/LibsqlClient";
import { Auth, GitHub, Http, OAuth, OAuthProxy, Sessions } from "@yielded/auth";
import { OAuthProxyPersistence } from "@yielded/auth-persistence";
import { LifecycleHooks } from "@yielded/auth/Hooks";
import { Effect, FileSystem, Layer, Redacted, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";
import { Migrator, SqlClient } from "effect/sql";

import { CryptoLive } from "../../shared/crypto";
import { makeStorage } from "../../shared/oauth/storage";
import { OAuthSignInApi } from "./oauth-contract";

export const githubIssuer = "https://github.com/login/oauth";
export const localOrigin = "http://localhost:3000";

export const HttpsOrigin = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      try {
        const url = new URL(value);

        return url.protocol === "https:" && value === url.origin;
      } catch {
        return false;
      }
    },
    { message: "Expected an exact HTTPS origin without a path or trailing slash" },
  ),
);

/** The host owns provider credentials, encrypted attempts, and no local accounts. */
export const makeProxyServer = (config: {
  readonly origin: string;
  readonly previewOrigin: string;
  readonly clientId: string;
  readonly clientSecret: Redacted.Redacted<string>;
  readonly localSecret: Redacted.Redacted<string>;
  readonly previewSecret: Redacted.Redacted<string>;
  readonly keys: OAuth.OAuthTransactionKeyring;
  readonly filename: string;
}) => {
  const database = Layer.effectDiscard(
    Migrator.make({})({
      table: "oauth_proxy_migrations",
      loader: Migrator.fromRecord({
        "0001_oauth_proxy": Effect.flatMap(SqlClient.SqlClient, (sql) =>
          sql.unsafe(OAuthProxyPersistence.migration).pipe(Effect.asVoid),
        ),
      }),
    }),
  ).pipe(
    Layer.provideMerge(LibsqlClient.layer({ url: `file:${config.filename}`, intMode: "number" })),
  );

  const live = Layer.unwrap(
    Effect.gen(function* () {
      const previewOrigin = yield* Schema.decodeEffect(HttpsOrigin)(config.previewOrigin);

      if (Redacted.value(config.localSecret) === Redacted.value(config.previewSecret))
        return yield* OAuthProxy.ConfigurationError.make({});

      return OAuthProxy.layer({
        origin: config.origin,
        providers: {
          github: GitHub.provider({ clientId: config.clientId, clientSecret: config.clientSecret }),
        },
        environments: [
          { id: "local", secret: config.localSecret, origin: localOrigin },
          { id: "preview", secret: config.previewSecret, origin: previewOrigin },
        ].map(({ id, secret, origin }) => ({
          id,
          secret,
          callbacks: [
            {
              provider: GitHub.gitHubOAuthAppProviderKey,
              callbackId: OAuth.OAuthCallbackId.make("github"),
              redirectUri: `${origin}/auth/github/callback`,
            },
          ],
        })),
      });
    }),
  ).pipe(
    Layer.provide(OAuthProxyPersistence.layer.pipe(Layer.provide(database))),
    Layer.provide(OAuthProxy.protectorLayer(config.keys)),
    Layer.provide(CryptoLive),
  );

  return { live, routes: OAuthProxy.routes.pipe(Layer.provide(live)) };
};

/** Local request binding, identity allowlist, and session authority stay in each app. */
export const makeProxyEnvironment = (config: {
  readonly origin: string;
  readonly proxyUrl: string;
  readonly environment: "local" | "preview";
  readonly secret: Redacted.Redacted<string>;
  readonly externalSubject: string;
  readonly filename: string;
  readonly sessionKeys: Sessions.SessionSigningKeyring;
  readonly transactionKeys: OAuth.OAuthTransactionKeyring;
}) => {
  const AppAuth = Auth.make(OAuthSignInApi, {
    sessions: Sessions.stateless(),
    strategies: { oauth: OAuth.make() },
    defaultStrategy: "oauth",
  });

  const http = Http.make(AppAuth, {
    origin: config.origin,
    cookie: { secure: config.environment === "preview" },
    oauth: {
      providers: {
        github: OAuthProxy.provider({
          url: config.proxyUrl,
          issuer: githubIssuer,
          environment: config.environment,
          secret: config.secret,
        }),
      },
    },
  });

  const dependencies = Layer.mergeAll(
    Layer.succeed(Sessions.SessionSigningKeys, config.sessionKeys),
    makeStorage({
      moduleId: "example/oauth/oauth",
      provider: "github",
      issuer: githubIssuer,
      externalSubject: config.externalSubject,
      subjectId: `github:${config.externalSubject}`,
    }).pipe(
      Layer.provideMerge(LibsqlClient.layer({ url: `file:${config.filename}`, intMode: "number" })),
    ),
    Layer.succeed(AppAuth.strategies.oauth.SessionClaims, {
      resolve: () => Effect.succeed({ role: "owner" as const }),
    }),
    Auth.RequestBindingConfig.layer({
      generation: 1,
      lifetimeMillis: 600_000,
      keyring: config.transactionKeys,
    }),
    OAuth.OAuthTransactionProtector.layer(config.transactionKeys),
    OAuth.OAuthReturnTargets.exactRoutes(["/account"]),
  ).pipe(Layer.provideMerge(CryptoLive), Layer.provideMerge(LifecycleHooks.empty));

  const live = http.layer.pipe(Layer.provideMerge(dependencies));

  const browser = Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      const javascript = yield* fs.readFileString(
        new URL("../dist/oauth-client.js", import.meta.url).pathname,
      );

      return HttpRouter.add(
        "GET",
        "/oauth-client.js",
        HttpServerResponse.text(javascript, { contentType: "text/javascript" }),
      );
    }),
  );

  const account = HttpRouter.add(
    "GET",
    "/account",
    Effect.gen(function* () {
      const auth = yield* AppAuth;
      const session = yield* auth.requireSession();

      return yield* HttpServerResponse.json({
        subjectId: session.subjectId,
        claims: session.claims,
      });
    }).pipe(
      Effect.catchTag("AuthenticationRequired", () =>
        HttpServerResponse.json({ error: "authentication_required" }, { status: 401 }),
      ),
    ),
  ).pipe(http.middleware);

  const routes = Layer.mergeAll(
    http.routes(),
    browser,
    account,
    HttpRouter.add("GET", "/", HttpServerResponse.redirect("/login")),
    HttpRouter.add(
      "GET",
      "/login",
      HttpServerResponse.html(`<!doctype html>
      <html lang="en"><meta charset="utf-8"><title>GitHub sign-in</title>
      <body data-provider="github" data-return-target="/account">
      <h1>Sign in with GitHub</h1><button>Sign in</button><output aria-live="polite"></output>
      <script type="module" src="/oauth-client.js"></script></body></html>`),
    ),
  ).pipe(Layer.provide(live));

  return { AppAuth, http, live, routes, dependencies };
};
