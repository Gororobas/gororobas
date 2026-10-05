import { Password } from "@yielded/auth";
import { Effect, Layer, Schema } from "effect";

import { AppAuth } from "./auth";
import { Registration } from "./contract";

const Passwords = AppAuth.strategies.password.Passwords;

/** Replace one library module function and keep its other methods. */
export const PasswordMethodsLive = Layer.effect(
  Passwords,
  Effect.gen(function* () {
    const defaults = yield* Passwords;

    return Passwords.of({
      ...defaults,
      planRegister: Effect.fn("Customers.planRegister")(function* (request) {
        const registration = yield* Schema.decodeEffect(Registration)({
          displayName: request.registration.displayName.trim(),
          username: request.registration.username,
        }).pipe(Effect.mapError(() => Password.PasswordRejected.make({})));

        return yield* defaults.planRegister({ ...request, registration });
      }),
    });
  }),
).pipe(Layer.provide(AppAuth.strategies.password.layer));
