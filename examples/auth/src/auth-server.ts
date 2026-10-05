import { Auth, Http, Password, Sessions } from "@yielded/auth";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/http-api";

import { AppApi, AuthApi } from "./auth-contract";

export const AppAuth = Auth.make(AuthApi, {
  sessions: Sessions.stateful(),
  strategies: { password: Password.make() },
  defaultStrategy: "password",
});

export const http = Http.make(AppAuth, { origin: "https://app.example.com" });

const HealthHandlers = HttpApiBuilder.group(AppApi, "health", (handlers) =>
  handlers.handle("check", () => Effect.succeed("ok")),
);

// Supply the application-owned session store, password store and account authority.
export const Routes = HttpApiBuilder.layer(AppApi, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide(http.handlers(AppApi)),
  Layer.provide(HealthHandlers),
  Layer.provide(AppAuth.layer),
);

// For a raw HttpRouter, merge this Layer with the application's route Layers.
export const AuthRoutes = Http.layer(AppAuth, { origin: "https://app.example.com" });

// In an application route covered by http.middleware, these local methods use
// AuthRequest from Effect context. Calling them does not make an HTTP request.
export const currentMember = Effect.gen(function* () {
  const auth = yield* AppAuth;
  const session = yield* auth.getSession();

  return session?.claims.displayName ?? null;
});
