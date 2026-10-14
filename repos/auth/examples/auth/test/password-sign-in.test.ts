import { it } from "@effect/vitest";
import {
  Auth,
  EmailDelivery,
  Hooks,
  Operations,
  Password,
  Sessions,
  WebCrypto,
} from "@yielded/auth";
import { Effect, Layer, Redacted } from "effect";
import { expect } from "vite-plus/test";

import { CryptoLive } from "../../shared/crypto";
import {
  makePasswordConsumer,
  passwordAuth,
  sessions,
  sessionPolicy,
} from "../src/password-method-consumer";

const base = Layer.mergeAll(
  WebCrypto.layerWebCrypto,
  Hooks.LifecycleHooks.empty,
  Password.PasswordHashing.layer().pipe(Layer.provide(CryptoLive)),
);

// Requested regression for the UUID API mismatch fixed in
// https://github.com/yielded-dev/auth/pull/203. Management sign-in must use real Effect Crypto.
it.effect(
  "rejects wrong passwords and issues a usable session with password management enabled",
  () =>
    Effect.gen(function* () {
      const model = yield* makePasswordConsumer;

      const strategy = sessions.statelessLayer(sessionPolicy).pipe(
        Layer.provide(
          Layer.succeed(Sessions.SessionSigningKeys, {
            activeKeyId: "test",
            keys: [
              {
                id: "test",
                material: Redacted.make("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
              },
            ],
          }),
        ),
        Layer.provide(base),
      );

      const completion = sessions
        .completionLayer()
        .pipe(Layer.provide(Layer.merge(strategy, model.layer)), Layer.provide(base));

      const handlers = sessions
        .handlersLayer({ maximumAgeMillis: 60_000 })
        .pipe(Layer.provide(Layer.merge(strategy, completion)));

      const services = Layer.mergeAll(
        model.layer,
        strategy,
        completion,
        handlers,
        Layer.succeed(Password.CompromisedPasswords, {
          check: () => Effect.succeed({ _tag: "Allowed" as const }),
        }),
        Layer.succeed(EmailDelivery.EmailDelivery, {
          send: () => Effect.fail(EmailDelivery.EmailNotAccepted.make({})),
        }),
      );

      const commands: Operations.AuthCredentialCommand[] = [];

      yield* Effect.gen(function* () {
        const auth = yield* passwordAuth.make;
        const email = "reader@example.invalid";
        const password = "A manager generated regression passphrase";

        yield* auth.register({
          requestId: "uuid-regression",
          email,
          newPassword: password,
          registration: { team: "staff" },
        });
        const rejected = yield* auth.signIn({ email, password: "wrong" }).pipe(Effect.result);

        expect(rejected).toMatchObject({ _tag: "Failure", failure: { _tag: "PasswordRejected" } });
        expect(commands).toEqual([]);
        const result = yield* auth.signIn({ email, password });

        expect(result).toMatchObject({
          _tag: "Authenticated",
          session: { claims: { team: "staff" } },
        });

        const issued = commands.find(
          (command) => command._tag === "Issue" && command.slot === "session",
        );

        if (issued?._tag !== "Issue")
          return yield* Effect.die("Missing private session credential");

        const verified = yield* sessions.operations.Verify.invoke(Operations.guest, {
          credential: Redacted.value(issued.credential),
        });

        expect(verified.claims).toEqual({ team: "staff" });
      }).pipe(
        Effect.scoped,
        Effect.provide(services),
        Effect.provideService(Auth.AuthRequest, {
          credentials: {},
          invocation: Operations.guest,
          credentialCommandSink: (issued) =>
            Effect.sync(() => {
              commands.push(...issued);
            }),
        }),
      );
    }).pipe(Effect.provide(base)),
  { timeout: 30000 },
);
