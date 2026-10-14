import * as LibsqlClient from "@effect/sql-libsql/LibsqlClient";
import { Auth, Http, Microsoft, OAuth, Sessions } from "@yielded/auth";
import { LifecycleHooks } from "@yielded/auth/Hooks";
import { Effect, FileSystem, Layer } from "effect";
import { FetchHttpClient, HttpRouter, HttpServerResponse } from "effect/http";

import { CryptoLive } from "../../shared/crypto";
import { makeStorage } from "../../shared/oauth/storage";
import { OAuthSignInApi } from "./oauth-contract";

/** Single-owner sign-in example. The common authority stores `tid:oid:tid`;
 * a different object or tenant cannot receive a session. */
export const makeMicrosoftExample = (config: {
  readonly origin: string;
  readonly clientId: string;
  readonly clientSecret: Microsoft.ProviderRegistration["clientSecret"];
  readonly objectId: string;
  readonly tenantId: string;
  readonly filename: string;
  readonly sessionKeys: Sessions.SessionSigningKeyring;
  readonly transactionKeys: Sessions.SessionSigningKeyring;
}) => {
  const authority = "https://login.microsoftonline.com/common/v2.0";
  const externalSubject = `${config.tenantId}:${config.objectId}:${config.tenantId}`;

  const AppAuth = Auth.make(OAuthSignInApi, {
    sessions: Sessions.stateless(),
    strategies: { oauth: OAuth.make({ profiles: { microsoft: Microsoft.MicrosoftUserProfile } }) },
    defaultStrategy: "oauth",
  });

  const http = Http.make(AppAuth, {
    origin: config.origin,
    cookie: { secure: new URL(config.origin).protocol === "https:" },
    oauth: {
      providers: {
        microsoft: Microsoft.provider({
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          scopes: ["openid", "profile", "email"],
        }),
      },
    },
  });

  const dependencies = Layer.mergeAll(
    Layer.succeed(Sessions.SessionSigningKeys, config.sessionKeys),
    makeStorage({
      moduleId: "example/oauth/oauth",
      provider: "microsoft",
      issuer: authority,
      externalSubject,
      subjectId: `microsoft:${externalSubject}`,
    }).pipe(
      Layer.provideMerge(LibsqlClient.layer({ url: `file:${config.filename}`, intMode: "number" })),
    ),
    Layer.succeed(
      AppAuth.strategies.oauth.SessionClaims,
      AppAuth.strategies.oauth.SessionClaims.of({
        resolve: ({ identity }) =>
          identity.profile?.providerData?.tid !== config.tenantId
            ? OAuth.OAuthUnavailable.make({})
            : Effect.succeed({ role: "owner" as const }),
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

  const login = HttpRouter.add(
    "GET",
    "/login",
    HttpServerResponse.html(`<!doctype html>
    <html lang="en"><meta charset="utf-8"><title>Sign in with Microsoft</title>
    <body data-provider="microsoft" data-return-target="/account">
    <h1>Sign in with Microsoft</h1><p>Use the configured Microsoft account.</p>
    <button type="button">Sign in with Microsoft</button>
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
