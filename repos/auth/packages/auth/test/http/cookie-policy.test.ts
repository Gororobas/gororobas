import { it } from "@effect/vitest";
import { Auth, Http, Sessions, Strava } from "@yielded/auth";
import { Effect, Layer, Redacted, Schema } from "effect";
import { expect } from "vite-plus/test";

const auth = Auth.make("test/cookie-policy", {
  claims: Schema.Struct({}),
  sessions: Sessions.stateless({
    keys: {
      activeKeyId: "test",
      keys: [
        { id: "test", material: Redacted.make("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA") },
      ],
    },
  }),
});

const startup = (options: Http.AuthHttpOptions<unknown, unknown, unknown>) =>
  Layer.build(Http.make(auth, options).operationLayer.pipe(Layer.provide(auth.layer))).pipe(
    Effect.scoped,
  );

// Requested hardening: exercise public layer acquisition, including custom cookie overrides.
it.effect.each([
  { name: "insecure HTTPS", cookie: { secure: false } },
  { name: "unprefixed secure session", cookie: { name: "app-session" } },
  { name: "unprefixed secure slots", cookie: { prefix: "app-" } },
])("rejects $name at startup", ({ cookie }) =>
  Effect.gen(function* () {
    const result = yield* startup({ origin: "https://app.example.com", cookie }).pipe(
      Effect.result,
    );

    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "OperationHttpConfigurationError", reason: "cookies" },
    });
  }),
);

it.effect("rejects strict cookies when OAuth needs a cross-site callback", () =>
  Effect.gen(function* () {
    const result = yield* startup({
      origin: "https://app.example.com",
      cookie: { sameSite: "strict" },
      oauth: {
        providers: {
          strava: Strava.provider({ clientId: "123", clientSecret: Redacted.make("test-secret") }),
        },
      },
    }).pipe(Effect.result);

    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "OperationHttpConfigurationError", reason: "cookies" },
    });
  }),
);

it.effect("keeps host-prefixed HTTPS and explicit loopback cookies usable", () =>
  Effect.gen(function* () {
    yield* startup({
      origin: "https://app.example.com",
      cookie: { name: "__Host-app-session", prefix: "__Host-app-" },
    });
    yield* startup({ origin: "http://localhost:3000", cookie: { secure: false, prefix: "app-" } });
  }),
);
