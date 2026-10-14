import * as LibsqlClient from "@effect/sql-libsql/LibsqlClient";
import { Apple, Auth, Http, OAuth, Sessions } from "@yielded/auth";
import { LifecycleHooks } from "@yielded/auth/Hooks";
import { Effect, FileSystem, Layer } from "effect";
import { FetchHttpClient, HttpRouter, HttpServerResponse } from "effect/http";

import { CryptoLive } from "../../shared/crypto";
import { makeStorage } from "../../shared/oauth/storage";
import { OAuthSignInApi } from "./oauth-contract";

/** Single-owner Sign in with Apple. SQL owns the exact external identity tuple. */
export const makeAppleExample = (config: {
  readonly origin: string;
  readonly clientId: string;
  readonly teamId: Apple.ProviderRegistration["teamId"];
  readonly keyId: Apple.ProviderRegistration["keyId"];
  readonly privateKey: Apple.ProviderRegistration["privateKey"];
  readonly userId: string;
  readonly filename: string;
  readonly sessionKeys: Sessions.SessionSigningKeyring;
  readonly transactionKeys: Sessions.SessionSigningKeyring;
}) => {
  const AppAuth = Auth.make(OAuthSignInApi, {
    sessions: Sessions.stateless(),
    strategies: { oauth: OAuth.make({ profiles: { apple: Apple.AppleUserProfile } }) },
    defaultStrategy: "oauth",
  });

  const http = Http.make(AppAuth, {
    origin: config.origin,
    cookie: { secure: new URL(config.origin).protocol === "https:" },
    oauth: {
      providers: {
        apple: Apple.provider({
          clientId: config.clientId,
          teamId: config.teamId,
          keyId: config.keyId,
          privateKey: config.privateKey,
          scopes: ["openid", "email", "name"],
        }),
      },
    },
  });

  const dependencies = Layer.mergeAll(
    Layer.succeed(Sessions.SessionSigningKeys, config.sessionKeys),
    makeStorage({
      moduleId: "example/oauth/oauth",
      provider: "apple",
      issuer: "https://appleid.apple.com",
      externalSubject: config.userId,
      subjectId: `apple:${config.userId}`,
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

  const login = HttpRouter.add(
    "GET",
    "/login",
    HttpServerResponse.html(`<!doctype html>
    <html lang="en"><meta charset="utf-8"><title>Sign in with Apple</title>
    <body data-provider="apple" data-return-target="/account">
    <h1>Sign in with Apple</h1><p>Use the configured Apple ID.</p>
    <button type="button">Sign in with Apple</button>
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
