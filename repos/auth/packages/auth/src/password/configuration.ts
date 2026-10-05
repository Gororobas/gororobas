import { Effect, Schema } from "effect";

import { PasswordConfigurationError } from "./errors";

export const PasswordHashingConfig = Schema.Struct({
  memoryKiB: Schema.Int.check(Schema.isBetween({ minimum: 19456, maximum: 65536 })),
  passes: Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 6 })),
  parallelism: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 })),
  maximumMemoryKiB: Schema.Int.check(Schema.isBetween({ minimum: 19456, maximum: 65536 })),
  maximumPasses: Schema.Int.check(Schema.isBetween({ minimum: 2, maximum: 6 })),
  maximumParallelism: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 })),
  maximumMemoryPasses: Schema.Int.check(Schema.isBetween({ minimum: 38912, maximum: 393216 })),
  maximumLegacyIterations: Schema.Int.check(
    Schema.isBetween({ minimum: 600000, maximum: 2000000 }),
  ),
  maximumPasswordBytes: Schema.Int.check(Schema.isBetween({ minimum: 256, maximum: 65536 })),
});

export type PasswordHashingConfig = typeof PasswordHashingConfig.Type;

/** OWASP Argon2id minimum profile. Host CPU/memory allowances must fit this cost;
 * runtime failures never cause an automatic downgrade. Limits are per permit.
 */
export const defaultPasswordHashingConfig: PasswordHashingConfig = Object.freeze({
  memoryKiB: 19456,
  passes: 2,
  parallelism: 1,
  maximumMemoryKiB: 65536,
  maximumPasses: 6,
  maximumParallelism: 4,
  maximumMemoryPasses: 131072,
  maximumLegacyIterations: 1000000,
  maximumPasswordBytes: 16384,
});

export const validatePasswordHashingConfig = Effect.fn("validatePasswordHashingConfig")(function* (
  input: PasswordHashingConfig,
) {
  const config = yield* Schema.decodeEffect(PasswordHashingConfig)(input).pipe(
    Effect.mapError(() => PasswordConfigurationError.make({ component: "hashing" })),
  );

  if (
    config.memoryKiB > config.maximumMemoryKiB ||
    config.passes > config.maximumPasses ||
    config.parallelism > config.maximumParallelism ||
    config.memoryKiB * config.passes > config.maximumMemoryPasses
  )
    return yield* PasswordConfigurationError.make({ component: "hashing" });

  return Object.freeze(config);
});
