import { Password, WebCrypto } from "@yielded/auth";
import * as PasswordCrypto from "@yielded/auth-crypto/Password";
import { Context, Effect, Layer, Ref } from "effect";

export class HashingStats extends Context.Service<
  HashingStats,
  {
    readonly read: Effect.Effect<{
      readonly hashes: number;
      readonly verifications: number;
      readonly dummies: number;
    }>;
  }
>()("example/HashingStats") {}

const PortableHashing = PasswordCrypto.layer().pipe(
  Layer.provide(Password.PasswordKdfAdmission.layer()),
  Layer.provide(WebCrypto.layerWebCrypto),
);

// Replace functions with ordinary Effect.fn values. This application adds tracing
// and counters while retaining the portable Argon2id implementation and admission.
export const HashingLive = Layer.effectContext(
  Effect.gen(function* () {
    const portable = yield* Password.PasswordHashing;
    const counters = yield* Ref.make({ hashes: 0, verifications: 0, dummies: 0 });

    const hashPassword = Effect.fn("Customers.hashPassword")(function* (
      ...args: Parameters<typeof portable.hash>
    ) {
      yield* Ref.update(counters, (value) => ({ ...value, hashes: value.hashes + 1 }));

      return yield* portable.hash(...args);
    });

    const verifyPassword = Effect.fn("Customers.verifyPassword")(function* (
      ...args: Parameters<typeof portable.verify>
    ) {
      yield* Ref.update(counters, (value) => ({
        ...value,
        verifications: value.verifications + 1,
      }));

      return yield* portable.verify(...args);
    });

    const dummy = Effect.fn("Customers.dummyPassword")(function* (
      ...args: Parameters<typeof portable.dummy>
    ) {
      yield* Ref.update(counters, (value) => ({ ...value, dummies: value.dummies + 1 }));

      return yield* portable.dummy(...args);
    });

    return Context.make(Password.PasswordHashing, {
      hash: hashPassword,
      verify: verifyPassword,
      dummy,
    }).pipe(Context.add(HashingStats, { read: Ref.get(counters) }));
  }),
).pipe(Layer.provide(PortableHashing));
