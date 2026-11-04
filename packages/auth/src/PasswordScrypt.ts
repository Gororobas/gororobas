// @effect-diagnostics-next-line nodeBuiltinImport:off -- This platform adapter selects Node native scrypt.
import * as crypto from "node:crypto";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";

import { PasswordHashingUnavailable } from "./password/errors";
import { Scrypt } from "./password/Scrypt";

const derive = Effect.fnUntraced(function* (input: Parameters<Scrypt["Service"]["derive"]>[0]) {
  if (typeof crypto.scrypt !== "function") return yield* PasswordHashingUnavailable.make({});

  // Native work cannot be cancelled. Keep admission and borrowed buffers until
  // its callback finishes, including when the caller requests interruption.
  return yield* Effect.callback<Uint8Array, PasswordHashingUnavailable>((resume) => {
    const registration = Result.try({
      try: () =>
        crypto.scrypt(
          input.password,
          input.salt,
          input.length,
          {
            N: input.cost,
            r: input.blockSize,
            p: input.parallelism,
            maxmem: input.maximumMemoryBytes,
          },
          // Bun supplies undefined on success; Node supplies null.
          (error, key) =>
            resume(error ? Effect.fail(PasswordHashingUnavailable.make({})) : Effect.succeed(key)),
        ),
      catch: () => PasswordHashingUnavailable.make({}),
    });

    if (Result.isFailure(registration)) resume(Effect.fail(registration.failure));
  }).pipe(Effect.uninterruptible);
});

export const layer = Layer.succeed(Scrypt, { derive });
