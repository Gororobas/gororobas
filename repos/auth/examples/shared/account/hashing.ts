import { Password } from "@yielded/auth";
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

// Add tracing and counters while retaining the application's KDF backend and admission.
export const HashingLive = Layer.effectContext(
  Effect.gen(function* () {
    const hashing = yield* Password.PasswordHashing;
    const counters = yield* Ref.make({ hashes: 0, verifications: 0, dummies: 0 });

    const hashPassword = Effect.fn("Customers.hashPassword")(function* (
      ...args: Parameters<typeof hashing.hash>
    ) {
      yield* Ref.update(counters, (value) => ({ ...value, hashes: value.hashes + 1 }));

      return yield* hashing.hash(...args);
    });

    const verifyPassword = Effect.fn("Customers.verifyPassword")(function* (
      ...args: Parameters<typeof hashing.verify>
    ) {
      yield* Ref.update(counters, (value) => ({
        ...value,
        verifications: value.verifications + 1,
      }));

      return yield* hashing.verify(...args);
    });

    const dummy = Effect.fn("Customers.dummyPassword")(function* (
      ...args: Parameters<typeof hashing.dummy>
    ) {
      yield* Ref.update(counters, (value) => ({ ...value, dummies: value.dummies + 1 }));

      return yield* hashing.dummy(...args);
    });

    return Context.make(Password.PasswordHashing, {
      hash: hashPassword,
      verify: verifyPassword,
      dummy,
    }).pipe(Context.add(HashingStats, { read: Ref.get(counters) }));
  }),
).pipe(Layer.provide(Password.PasswordHashing.layer()));
