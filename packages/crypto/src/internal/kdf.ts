import { Effect, Redacted, Schema } from "effect";

import { InvalidInput, type OperationError, UnsupportedAlgorithm } from "../Errors";
import { Argon2idInput, HkdfInput, Kdf, type Limits, Pbkdf2Input, ScryptInput } from "../Kdf";
import { KdfAdmission } from "../KdfAdmission";
import { copy, decode, importError, nativeError, withSecret } from "./common";
import { ScryptBackend } from "./scrypt-backend";

export interface Argon2Parameters {
  readonly password: Uint8Array<ArrayBuffer>;
  readonly salt: Uint8Array<ArrayBuffer>;
  readonly memoryKiB: number;
  readonly passes: number;
  readonly parallelism: number;
  readonly length: number;
  readonly secret?: Uint8Array<ArrayBuffer>;
  readonly associatedData: Uint8Array<ArrayBuffer>;
}

export type Argon2 = (input: Argon2Parameters) => Effect.Effect<Uint8Array, OperationError>;

export const makeKdf = Effect.fnUntraced(function* (
  subtle: SubtleCrypto,
  limits: Limits,
  argon2?: Argon2,
) {
  const admission = yield* KdfAdmission;
  const scrypt = yield* ScryptBackend;
  const boundedBytes = Schema.Uint8Array.check(Schema.isMaxLength(limits.maximumInputBytes));

  const output = Schema.Int.check(
    Schema.isBetween({ minimum: 1, maximum: limits.maximumOutputBytes }),
  );

  const inputBytes = (input: Uint8Array) => decode(boundedBytes, input, "data");
  const outputLength = (input: number) => decode(output, input, "parameters");

  return Kdf.of({
    scrypt: (input) =>
      admission.run(
        Effect.gen(function* () {
          const value = yield* decode(ScryptInput, input, "parameters");

          yield* outputLength(value.length);
          yield* inputBytes(Redacted.value(value.password));
          yield* inputBytes(value.salt);

          const memoryBytes = 128 * value.blockSize * (value.cost + value.parallelism + 2);

          if (
            !Number.isInteger(Math.log2(value.cost)) ||
            Math.log2(value.cost) >= 16 * value.blockSize ||
            value.blockSize * value.parallelism >= 2 ** 30 ||
            memoryBytes > limits.maximumMemoryKiB * 1024 ||
            (value.cost * value.blockSize * value.parallelism) / 8 > limits.maximumMemoryPasses
          )
            return yield* InvalidInput.make({ reason: "parameters" });
          const salt = yield* copy(value.salt);

          return yield* withSecret(value.password, (password) =>
            scrypt
              .derive({
                password,
                salt,
                cost: value.cost,
                blockSize: value.blockSize,
                parallelism: value.parallelism,
                length: value.length,
                maximumMemoryBytes: limits.maximumMemoryKiB * 1024,
              })
              .pipe(Effect.map(Redacted.make)),
          );
        }),
      ),
    pbkdf2: (input) =>
      admission.run(
        Effect.gen(function* () {
          const value = yield* decode(Pbkdf2Input, input, "parameters");

          yield* decode(
            Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: limits.maximumIterations })),
            value.iterations,
            "parameters",
          );
          yield* outputLength(value.length);
          yield* inputBytes(Redacted.value(value.password));
          yield* inputBytes(value.salt);
          const salt = yield* copy(value.salt);

          return yield* withSecret(value.password, (password) =>
            Effect.gen(function* () {
              const key = yield* Effect.tryPromise({
                try: () => subtle.importKey("raw", password, "PBKDF2", false, ["deriveBits"]),
                catch: importError,
              });

              const result = yield* Effect.tryPromise({
                try: () =>
                  subtle.deriveBits(
                    { name: "PBKDF2", hash: "SHA-256", salt, iterations: value.iterations },
                    key,
                    value.length * 8,
                  ),
                catch: nativeError,
              });

              return Redacted.make(new Uint8Array(result));
            }).pipe(Effect.uninterruptible),
          );
        }),
      ),
    hkdf: (input) =>
      admission.run(
        Effect.gen(function* () {
          const value = yield* decode(HkdfInput, input, "parameters");

          yield* outputLength(value.length);
          yield* inputBytes(Redacted.value(value.key));
          yield* inputBytes(value.salt);
          yield* inputBytes(value.info);
          const salt = yield* copy(value.salt);
          const info = yield* copy(value.info);

          return yield* withSecret(value.key, (material) =>
            Effect.gen(function* () {
              const key = yield* Effect.tryPromise({
                try: () => subtle.importKey("raw", material, "HKDF", false, ["deriveBits"]),
                catch: importError,
              });

              const result = yield* Effect.tryPromise({
                try: () =>
                  subtle.deriveBits(
                    { name: "HKDF", hash: "SHA-256", salt, info },
                    key,
                    value.length * 8,
                  ),
                catch: nativeError,
              });

              return Redacted.make(new Uint8Array(result));
            }).pipe(Effect.uninterruptible),
          );
        }),
      ),
    argon2id: (input) =>
      admission.run(
        Effect.gen(function* () {
          const value = yield* decode(Argon2idInput, input, "parameters");

          yield* outputLength(value.length);
          yield* inputBytes(Redacted.value(value.password));
          yield* inputBytes(value.salt);
          if (value.secret !== undefined) yield* inputBytes(Redacted.value(value.secret));
          if (value.associatedData !== undefined) yield* inputBytes(value.associatedData);

          if (
            value.memoryKiB < 8 * value.parallelism ||
            value.memoryKiB > limits.maximumMemoryKiB ||
            value.passes > limits.maximumPasses ||
            value.parallelism > limits.maximumParallelism ||
            value.memoryKiB * value.passes > limits.maximumMemoryPasses
          )
            return yield* InvalidInput.make({ reason: "parameters" });
          if (argon2 === undefined) return yield* UnsupportedAlgorithm.make({});

          const salt = yield* copy(value.salt);
          const associatedData = yield* copy(value.associatedData ?? new Uint8Array());

          return yield* withSecret(value.password, (password) => {
            const derive = (secret?: Uint8Array<ArrayBuffer>) =>
              argon2({
                password,
                salt,
                ...(secret === undefined ? {} : { secret }),
                associatedData,
                memoryKiB: value.memoryKiB,
                passes: value.passes,
                parallelism: value.parallelism,
                length: value.length,
              }).pipe(Effect.map((bytes) => Redacted.make(bytes)));

            return value.secret === undefined ? derive() : withSecret(value.secret, derive);
          });
        }),
      ),
  });
});
