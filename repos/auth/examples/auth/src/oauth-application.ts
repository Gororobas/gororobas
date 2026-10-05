import { Auth, Http, Sessions } from "@yielded/auth";
import * as OAuthCrypto from "@yielded/auth-crypto/OAuth";
import { LifecycleHooks } from "@yielded/auth/Hooks";
import {
  OAuthReturnTargets,
  type OAuthConnectedProfile,
  type ProviderDefinition,
} from "@yielded/auth/OAuth";
import type { SessionSigningKeyring } from "@yielded/auth/Sessions";
import { OAuth } from "@yielded/auth/strategies";
import { layerWebCrypto } from "@yielded/auth/WebCrypto";
import { Effect, FileSystem, Layer } from "effect";
import { FetchHttpClient, HttpRouter, HttpServerResponse } from "effect/http";

import { OAuthApi } from "./oauth-contract";
import { makeStorage } from "./oauth-storage";

/** Composition shared only by these runnable, single-owner consumer examples. */
export const makeExample = <E, R>(config: {
  readonly origin: string;
  readonly profile: OAuthConnectedProfile;
  readonly provider: ProviderDefinition<E, R>;
  readonly issuer: string;
  readonly externalSubject: string;
  readonly subjectId: string;
  readonly filename: string;
  readonly sessionKeys: SessionSigningKeyring;
  readonly transactionKeys: SessionSigningKeyring;
  readonly tokenKeys: SessionSigningKeyring;
  readonly returnTarget?: string;
}) => {
  const AppAuth = Auth.make(OAuthApi, {
    sessions: Sessions.stateless({ keys: config.sessionKeys }),
    strategies: { oauth: OAuth.make({ access: config.profile }) },
    defaultStrategy: "oauth",
  });

  const oauth = AppAuth.strategies.oauth;
  const returnTarget = config.returnTarget ?? "/account";

  const http = Http.make(AppAuth, {
    origin: config.origin,
    cookie: { secure: new URL(config.origin).protocol === "https:" },
    oauth: {
      providers: { [config.profile.provider]: config.provider },
      callbacks: { [config.profile.provider]: { allowedQueryParameters: ["scope"] } },
    },
  });

  const storage = makeStorage({
    moduleId: "example/oauth/oauth",
    provider: config.profile.provider,
    issuer: config.issuer,
    externalSubject: config.externalSubject,
    subjectId: config.subjectId,
    filename: config.filename,
  });

  const dependencies = Layer.mergeAll(
    storage,
    Layer.succeed(oauth.SessionClaims, {
      resolve: () => Effect.succeed({ role: "owner" as const }),
    }),
    Auth.RequestBindingConfig.layer({
      generation: 1,
      lifetimeMillis: 600_000,
      keyring: config.transactionKeys,
    }),
    OAuthCrypto.transactionLayer(config.transactionKeys),
    OAuthCrypto.connectedTransactionLayer(config.transactionKeys),
    OAuthCrypto.connectedTokenLayer(config.tokenKeys),
    OAuthReturnTargets.exactRoutes([returnTarget]),
    FetchHttpClient.layer,
  ).pipe(Layer.provideMerge(layerWebCrypto), Layer.provideMerge(LifecycleHooks.empty));

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
        HttpServerResponse.text(javascript, {
          contentType: "text/javascript",
        }),
      );
    }),
  );

  const escape = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

  const login = HttpRouter.add(
    "GET",
    "/login",
    HttpServerResponse.html(`<!doctype html>
    <html lang="en"><meta charset="utf-8"><title>Provider sign-in</title>
    <body data-provider="${escape(config.profile.provider)}" data-return-target="${escape(returnTarget)}">
    <h1>Connect ${escape(config.profile.provider)}</h1><button>Sign in and connect</button>
    <output aria-live="polite"></output><script type="module" src="/oauth-client.js"></script></body></html>`),
  );

  const account = HttpRouter.add(
    "GET",
    "/account",
    Effect.gen(function* () {
      const auth = yield* AppAuth;
      const session = yield* auth.requireSession();
      const connections = yield* auth.listAccountConnections({ limit: 20 });

      return yield* HttpServerResponse.json({ subjectId: session.subjectId, connections });
    }),
  ).pipe(http.middleware);

  const routes = Layer.mergeAll(
    http.routes(),
    browser,
    login,
    account,
    HttpRouter.add("GET", "/", HttpServerResponse.redirect("/login")),
  ).pipe(Layer.provide(live));

  return { AppAuth, http, live, routes, dependencies };
};
