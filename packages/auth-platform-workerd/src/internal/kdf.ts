import * as CryptoError from "effect/crypto/CryptoError";
import * as Kdf from "effect/crypto/Kdf";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import type { Argon2 } from "./argon2";

const uint32 = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 0xffffffff }));
const bytes = Schema.Uint8Array.check(Schema.isMaxLength(0xffffffff));

const Input = Schema.Struct({
  password: bytes,
  salt: bytes.check(Schema.isMinLength(8)),
  memoryKiB: uint32,
  passes: uint32,
  parallelism: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 0xffffff })),
  length: Schema.Int.check(Schema.isBetween({ minimum: 4, maximum: 0xffffffff })),
});

const invalid = () =>
  new CryptoError.CryptoError({
    module: "Kdf",
    method: "derive",
    reason: new CryptoError.InvalidArgument({ description: "Invalid Argon2id parameters" }),
  });

/** Add portable Argon2id to Effect's WebCrypto KDFs. PasswordHashing owns resource policy. */
export const makeLayer = (argon2: Argon2) =>
  Layer.effect(
    Kdf.Kdf,
    Effect.gen(function* () {
      const web = yield* Kdf.Kdf;

      return Kdf.Kdf.of({
        derive: (algorithm, password, options) => {
          if (algorithm._tag !== "Argon2id") return web.derive(algorithm, password, options);

          return Effect.gen(function* () {
            const input = yield* Schema.decodeEffect(Input)({
              password,
              salt: options.salt,
              length: options.length,
              memoryKiB: algorithm.memory,
              passes: algorithm.passes,
              parallelism: algorithm.parallelism,
            }).pipe(Effect.mapError(invalid));

            if (options.info !== undefined || input.memoryKiB < 8 * input.parallelism)
              return yield* invalid();

            return yield* Effect.acquireUseRelease(
              Effect.sync(() => new Uint8Array(input.password)),
              (owned) =>
                argon2({
                  ...input,
                  password: owned,
                  salt: new Uint8Array(input.salt),
                  associatedData: new Uint8Array(),
                }),
              (owned) => Effect.sync(() => owned.fill(0)),
            );
          });
        },
      });
    }),
  ).pipe(Layer.provide(Kdf.layerWebCrypto));
