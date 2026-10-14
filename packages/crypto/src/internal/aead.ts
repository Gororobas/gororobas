import { Effect, Redacted, Schema } from "effect";

import {
  Aead,
  DecryptInput,
  EncryptInput,
  type Key,
  KeyDecryptInput,
  KeyEncryptInput,
  KeyInput,
} from "../Aead";
import { AuthenticationFailed, type OperationError, UnsupportedAlgorithm } from "../Errors";
import { copy, decode, importError, nativeError, nativeErrorName, withSecret } from "./common";
import { makeScopedKey } from "./scoped-key";

interface CipherData {
  readonly nonce: Uint8Array<ArrayBuffer>;
  readonly additionalData: Uint8Array<ArrayBuffer>;
  readonly data: Uint8Array<ArrayBuffer>;
}

interface CipherInput extends CipherData {
  readonly key: Uint8Array<ArrayBuffer>;
}

export interface XChaCha {
  readonly encrypt: (input: CipherInput) => Effect.Effect<Uint8Array, OperationError>;
  readonly decrypt: (
    input: CipherInput,
  ) => Effect.Effect<Uint8Array, OperationError | AuthenticationFailed>;
}

const keyBytes = Schema.Uint8Array.check(Schema.isBetweenLength(32, 32));
const aesNonce = Schema.Uint8Array.check(Schema.isBetweenLength(12, 12));

export const makeAead = (subtle: SubtleCrypto, xchacha?: XChaCha): Aead["Service"] => {
  const encryptAes = (key: CryptoKey, input: CipherData) =>
    Effect.tryPromise({
      try: () =>
        subtle.encrypt(
          {
            name: "AES-GCM",
            iv: input.nonce,
            additionalData: input.additionalData,
            tagLength: 128,
          },
          key,
          input.data,
        ),
      catch: nativeError,
    }).pipe(Effect.map((encrypted) => new Uint8Array(encrypted)));

  const decryptAes = (key: CryptoKey, input: CipherData) =>
    Effect.tryPromise({
      try: () =>
        subtle.decrypt(
          {
            name: "AES-GCM",
            iv: input.nonce,
            additionalData: input.additionalData,
            tagLength: 128,
          },
          key,
          input.data,
        ),
      // WebCrypto specifies OperationError for a rejected GCM tag.
      catch: (cause) =>
        nativeErrorName(cause) === "OperationError"
          ? AuthenticationFailed.make({})
          : nativeError(cause),
    }).pipe(Effect.map((decrypted) => new Uint8Array(decrypted)));

  return Aead.of({
    supports: (algorithm) =>
      algorithm === "AES-256-GCM" || (algorithm === "XChaCha20-Poly1305" && xchacha !== undefined),
    importKey: Effect.fnUntraced(function* (input) {
      const value = yield* decode(KeyInput, input, "key");

      yield* decode(keyBytes, Redacted.value(value.key), "key");

      const use = yield* makeScopedKey(
        withSecret(value.key, (material) =>
          Effect.tryPromise({
            try: () => subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]),
            catch: importError,
          }),
        ),
      );

      return {
        encrypt: Effect.fnUntraced(function* (input) {
          const value = yield* decode(KeyEncryptInput, input, "data");
          const nonce = yield* decode(aesNonce, value.nonce, "nonce").pipe(Effect.flatMap(copy));
          const additionalData = yield* copy(value.additionalData ?? new Uint8Array());

          return yield* withSecret(value.plaintext, (data) =>
            use((key) => encryptAes(key, { nonce, additionalData, data })),
          );
        }),
        decrypt: Effect.fnUntraced(function* (input) {
          const value = yield* decode(KeyDecryptInput, input, "data");
          const nonce = yield* decode(aesNonce, value.nonce, "nonce").pipe(Effect.flatMap(copy));
          const additionalData = yield* copy(value.additionalData ?? new Uint8Array());
          const data = yield* copy(value.ciphertext);

          const plaintext = yield* use((key) =>
            data.length < 16
              ? Effect.fail(AuthenticationFailed.make({}))
              : decryptAes(key, { nonce, additionalData, data }),
          );

          return Redacted.make(plaintext);
        }),
      } satisfies Key;
    }),
    encrypt: Effect.fnUntraced(function* (input) {
      const value = yield* decode(EncryptInput, input, "data");
      const nonceLength = value.algorithm === "AES-256-GCM" ? 12 : 24;

      yield* decode(keyBytes, Redacted.value(value.key), "key");
      yield* decode(
        Schema.Uint8Array.check(Schema.isBetweenLength(nonceLength, nonceLength)),
        value.nonce,
        "nonce",
      );
      if (value.algorithm === "XChaCha20-Poly1305" && xchacha === undefined)
        return yield* UnsupportedAlgorithm.make({});
      const nonce = yield* copy(value.nonce);
      const additionalData = yield* copy(value.additionalData ?? new Uint8Array());

      return yield* withSecret(value.key, (key) =>
        withSecret(value.plaintext, (data) => {
          if (value.algorithm === "XChaCha20-Poly1305") {
            return xchacha === undefined
              ? Effect.fail(UnsupportedAlgorithm.make({}))
              : xchacha.encrypt({ key, nonce, additionalData, data });
          }

          return Effect.gen(function* () {
            const imported = yield* Effect.tryPromise({
              try: () => subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]),
              catch: importError,
            });

            return yield* encryptAes(imported, { nonce, additionalData, data });
          }).pipe(Effect.uninterruptible);
        }),
      );
    }),
    decrypt: Effect.fnUntraced(function* (input) {
      const value = yield* decode(DecryptInput, input, "data");
      const nonceLength = value.algorithm === "AES-256-GCM" ? 12 : 24;

      yield* decode(keyBytes, Redacted.value(value.key), "key");
      yield* decode(
        Schema.Uint8Array.check(Schema.isBetweenLength(nonceLength, nonceLength)),
        value.nonce,
        "nonce",
      );
      if (value.algorithm === "XChaCha20-Poly1305" && xchacha === undefined)
        return yield* UnsupportedAlgorithm.make({});
      if (value.ciphertext.length < 16) return yield* AuthenticationFailed.make({});
      const nonce = yield* copy(value.nonce);
      const additionalData = yield* copy(value.additionalData ?? new Uint8Array());
      const data = yield* copy(value.ciphertext);

      const plaintext = yield* withSecret(value.key, (key) => {
        if (value.algorithm === "XChaCha20-Poly1305") {
          return xchacha === undefined
            ? Effect.fail(UnsupportedAlgorithm.make({}))
            : xchacha.decrypt({ key, nonce, additionalData, data });
        }

        return Effect.gen(function* () {
          const imported = yield* Effect.tryPromise({
            try: () => subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]),
            catch: importError,
          });

          return yield* decryptAes(imported, { nonce, additionalData, data });
        }).pipe(Effect.uninterruptible);
      });

      return Redacted.make(plaintext);
    }),
  });
};
