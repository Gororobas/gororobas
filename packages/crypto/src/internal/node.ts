// @effect-diagnostics-next-line nodeBuiltinImport:off -- This platform adapter needs native Argon2 and WebCrypto, which Effect Crypto does not expose.
import * as crypto from "node:crypto";

import { Effect, Layer, Result } from "effect";

import { CryptoUnavailable, UnsupportedAlgorithm } from "../Errors";
import type { Limits } from "../Kdf";
import type { Argon2, Argon2Parameters } from "./kdf";
import { makeLayer } from "./layer";
import * as Scrypt from "./scrypt";
import { xchacha } from "./xchacha";

const argon2: Argon2 = Effect.fnUntraced(function* (input: Argon2Parameters) {
  // Namespace import keeps this module loadable on Node versions without Argon2.
  if (typeof crypto.argon2 !== "function") return yield* UnsupportedAlgorithm.make({});

  // Node cannot cancel this work. Keep borrowed buffers and admission until the
  // callback completes, including when its caller has requested interruption.
  return yield* Effect.callback<Uint8Array, CryptoUnavailable>((resume) => {
    const registration = Result.try({
      try: () =>
        crypto.argon2(
          "argon2id",
          {
            message: input.password,
            nonce: input.salt,
            parallelism: input.parallelism,
            memory: input.memoryKiB,
            passes: input.passes,
            tagLength: input.length,
            secret: input.secret,
            associatedData: input.associatedData,
          },
          (error, key) =>
            resume(error === null ? Effect.succeed(key) : Effect.fail(CryptoUnavailable.make({}))),
        ),
      catch: () => CryptoUnavailable.make({}),
    });

    if (Result.isFailure(registration)) resume(Effect.fail(registration.failure));
  }).pipe(Effect.uninterruptible);
});

/** Node-compatible WebCrypto and native password KDFs with portable XChaCha20-Poly1305. */
export const layer = (limits: Partial<Limits> = {}) =>
  // Node's declarations include additional key usages absent from lib.dom. The
  // standard operations used here share the WebCrypto ABI; no payload is cast.
  makeLayer(crypto.webcrypto.subtle as SubtleCrypto, limits, { argon2, xchacha }).pipe(
    Layer.provide(Scrypt.layer),
  );
