import * as LibsqlClient from "@effect/sql-libsql/LibsqlClient";
import { Auth, Http, OAuth, Sessions } from "@yielded/auth";
import { LifecycleHooks } from "@yielded/auth/Hooks";
import type { ProviderDefinition } from "@yielded/auth/OAuth";
import { Effect, FileSystem, Layer, type Schema } from "effect";
import { FetchHttpClient, HttpRouter, HttpServerResponse } from "effect/http";

import { CryptoLive } from "../../shared/crypto";
import { makeStorage } from "../../shared/oauth/storage";
import { OAuthSignInApi } from "./oauth-contract";

/** Single-owner sign-in example shared by the plain OAuth presets. */
export const makeOAuthSignInExample = <E, R, S extends Schema.Codec<Schema.JsonObject>>(config: {
  readonly origin: string;
  readonly provider: string;
  readonly issuer: string;
  readonly title: string;
  readonly externalSubject: string;
  readonly filename: string;
  readonly sessionKeys: Sessions.SessionSigningKeyring;
  readonly transactionKeys: Sessions.SessionSigningKeyring;
  readonly profile: S;
  readonly strategy: ProviderDefinition<E, R>;
}) => {
  const AppAuth = Auth.make(OAuthSignInApi, {
    sessions: Sessions.stateless(),
    strategies: { oauth: OAuth.make({ profiles: { [config.provider]: config.profile } }) },
    defaultStrategy: "oauth",
  });

  const http = Http.make(AppAuth, {
    origin: config.origin,
    cookie: { secure: new URL(config.origin).protocol === "https:" },
    oauth: {
      providers: {
        [config.provider]: config.strategy,
      },
    },
  });

  const dependencies = Layer.mergeAll(
    Layer.succeed(Sessions.SessionSigningKeys, config.sessionKeys),
    makeStorage({
      moduleId: "example/oauth/oauth",
      provider: config.provider,
      issuer: config.issuer,
      externalSubject: config.externalSubject,
      subjectId: `${config.provider}:${config.externalSubject}`,
    }).pipe(
      Layer.provideMerge(LibsqlClient.layer({ url: `file:${config.filename}`, intMode: "number" })),
    ),
    Layer.succeed(
      AppAuth.strategies.oauth.SessionClaims,
      AppAuth.strategies.oauth.SessionClaims.of({
        resolve: () => Effect.succeed({ role: "owner" as const }),
      }),
    ),
    Auth.RequestBindingConfig.layer({
      generation: 1,
      lifetimeMillis: 600_000,
      keyring: config.transactionKeys,
    }),
    OAuth.OAuthTransactionProtector.layer(config.transactionKeys),
    OAuth.OAuthReturnTargets.exactRoutes(["/account"]),
    FetchHttpClient.layer,
  ).pipe(Layer.provideMerge(CryptoLive), Layer.provideMerge(LifecycleHooks.empty));

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

  const escape = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

  const login = HttpRouter.add(
    "GET",
    "/login",
    HttpServerResponse.html(`<!doctype html>
    <html lang="en"><meta charset="utf-8"><title>${escape(config.title)}</title>
    <body data-provider="${escape(config.provider)}" data-return-target="/account">
    <h1>${escape(config.title)}</h1><p>Use the configured account.</p>
    <button>${escape(config.title)}</button>
    <output aria-live="polite"></output><script type="module" src="/oauth-client.js"></script></body></html>`),
  );

  const account = HttpRouter.add(
    "GET",
    "/account",
    Effect.gen(function* () {
      const auth = yield* AppAuth;
      const session = yield* auth.getSession();

      if (session === null) return HttpServerResponse.redirect("/login");

      return yield* HttpServerResponse.json({
        subjectId: session.subjectId,
        role: session.claims.role,
      });
    }),
  ).pipe(http.middleware);

  return Layer.mergeAll(
    http.routes(),
    browser,
    login,
    account,
    HttpRouter.add("GET", "/", HttpServerResponse.redirect("/login")),
  ).pipe(Layer.provide(http.layer), Layer.provide(dependencies));
};
