import { Auth, Sessions, Http } from "@yielded/auth";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import { Claims, ProfileApi, SessionHttp } from "./session-contract";

export const AppAuth = Auth.make("example/session-auth", {
  claims: Claims,
  sessions: Sessions.stateful({ idleTimeout: "7 days", maxAge: "30 days", cacheFor: "1 minute" }),
});

const http = Http.make(AppAuth, {
  origin: "https://app.example.com",
  cookie: { name: SessionHttp.cookieName },
});

const ProfileHandlers = HttpApiBuilder.group(ProfileApi, "profile", (handlers) =>
  Effect.succeed(
    handlers.handle("current", () =>
      Effect.map(SessionHttp.CurrentSession, (session) => session.claims),
    ),
  ),
);

// Supply the bound StatefulSessionPersistence and SessionRepository through a storage Layer.
// Set AUTH_SECRET through Effect Config and supply a crypto Layer with HMAC support.
// This example installs no authentication methods.
export const Routes = Layer.mergeAll(
  http.routes(),
  HttpApiBuilder.layer(ProfileApi).pipe(
    Layer.provide(ProfileHandlers),
    Layer.provide(http.securityLayer(SessionHttp)),
    http.middleware,
  ),
).pipe(Layer.provide(AppAuth.layer));
