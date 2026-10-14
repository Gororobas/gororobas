import { it } from "@effect/vitest";
import { Aead } from "@yielded/crypto/Aead";
import { Hmac } from "@yielded/crypto/Hmac";
import { Kdf } from "@yielded/crypto/Kdf";
import { Effect, Redacted, Schema } from "effect";
import { Hex } from "effect/encoding";
import { describe, expect } from "vite-plus/test";

import { backends } from "./backends";
import { aeadVectors, argon2Vector, hkdfVector, hmacVectors, pbkdf2Vectors } from "./vectors";

const bytes = Schema.decodeSync(Schema.Uint8ArrayFromHex);

// Public Effect adaptation of Noble's known-answer tests and
// selected independent RFC/Wycheproof vectors. Exact provenance and licenses:
// vectors.ts and ../THIRD_PARTY_NOTICES.md.
for (const backend of backends) {
  describe(`${backend.name}`, () => {
    for (const vector of hmacVectors) {
      it.effect(`matches ${vector.hash} and rejects changed or truncated MACs`, () =>
        Effect.gen(function* () {
          const hmac = yield* Hmac;
          const key = bytes(vector.keyHex);
          const data = bytes(vector.messageHex);
          const tag = bytes(vector.expectedHex);

          // Views deliberately exclude sentinels to detect whole-buffer imports.
          const input = {
            algorithm: vector.hash,
            key: Redacted.make(new Uint8Array([255, ...key, 255]).subarray(1, key.length + 1)),
            data: new Uint8Array([255, ...data, 255]).subarray(1, data.length + 1),
          };

          expect(Hex.encode(yield* hmac.sign(input))).toBe(vector.expectedHex);
          expect(yield* hmac.verify({ ...input, tag })).toBe(true);
          expect(yield* hmac.verify({ ...input, tag: tag.subarray(1) })).toBe(false);
          expect(yield* hmac.verify({ ...input, data: new Uint8Array([0]), tag })).toBe(false);
          expect(Hex.encode(Redacted.value(input.key))).toBe(vector.keyHex);
        }).pipe(Effect.provide(backend.layer)),
      );
    }

    for (const vector of aeadVectors) {
      if (vector.algorithm === "XChaCha20-Poly1305" && !backend.extended) continue;

      it.effect(`matches ${vector.algorithm} and authenticates ciphertext, nonce and AAD`, () =>
        Effect.gen(function* () {
          const aead = yield* Aead;

          const context = {
            algorithm: vector.algorithm,
            key: Redacted.make(bytes(vector.keyHex)),
            nonce: bytes(vector.nonceHex),
            additionalData: bytes(vector.aadHex),
          };

          const sealed = yield* aead.encrypt({
            ...context,
            plaintext: Redacted.make(bytes(vector.plaintextHex)),
          });

          expect(Hex.encode(sealed)).toBe(vector.sealedHex);

          const opened = yield* aead.decrypt({ ...context, ciphertext: bytes(vector.sealedHex) });

          expect(Hex.encode(Redacted.value(opened))).toBe(vector.plaintextHex);
          expect(JSON.stringify(opened)).not.toContain(vector.plaintextHex);

          const changed = bytes(vector.sealedHex);

          changed[changed.length - 1] = changed[changed.length - 1]! ^ 1;

          for (const invalid of [
            { ...context, ciphertext: changed },
            { ...context, nonce: new Uint8Array(context.nonce.length), ciphertext: sealed },
            { ...context, additionalData: new Uint8Array(), ciphertext: sealed },
            { ...context, ciphertext: new Uint8Array(15) },
          ]) {
            expect(yield* aead.decrypt(invalid).pipe(Effect.flip)).toMatchObject({
              _tag: "CryptoAuthenticationFailed",
            });
          }
          expect(Hex.encode(Redacted.value(context.key))).toBe(vector.keyHex);
        }).pipe(Effect.provide(backend.layer)),
      );
    }

    for (const vector of pbkdf2Vectors) {
      it.effect(`derives byte-preserving ${vector.id}`, () =>
        Effect.gen(function* () {
          const kdf = yield* Kdf;
          const password = bytes(vector.passwordHex);
          const salt = bytes(vector.saltHex);

          const result = yield* kdf.pbkdf2({
            password: Redacted.make(password),
            salt,
            iterations: vector.iterations,
            length: vector.lengthBytes,
          });

          expect(Hex.encode(Redacted.value(result))).toBe(vector.expectedHex);
          expect(Hex.encode(password)).toBe(vector.passwordHex);
          expect(Hex.encode(salt)).toBe(vector.saltHex);
          expect(JSON.stringify(result)).not.toContain(vector.expectedHex);
        }).pipe(Effect.provide(backend.layer)),
      );
    }

    it.effect("derives RFC5869 HKDF with distinct salt/info and more than one output block", () =>
      Effect.gen(function* () {
        const kdf = yield* Kdf;

        const result = yield* kdf.hkdf({
          key: Redacted.make(bytes(hkdfVector.ikmHex)),
          salt: bytes(hkdfVector.saltHex),
          info: bytes(hkdfVector.infoHex),
          length: hkdfVector.lengthBytes,
        });

        expect(Hex.encode(Redacted.value(result))).toBe(hkdfVector.expectedHex);
      }).pipe(Effect.provide(backend.layer)),
    );

    if (backend.extended) {
      it.effect("derives RFC9106 Argon2id v19 with lanes, secret and associated data", () =>
        Effect.gen(function* () {
          const kdf = yield* Kdf;
          const password = bytes(argon2Vector.passwordHex);

          const result = yield* kdf.argon2id({
            password: Redacted.make(password),
            salt: bytes(argon2Vector.saltHex),
            secret: Redacted.make(bytes(argon2Vector.secretHex)),
            associatedData: bytes(argon2Vector.associatedDataHex),
            memoryKiB: argon2Vector.memoryKiB,
            passes: argon2Vector.iterations,
            parallelism: argon2Vector.parallelism,
            length: argon2Vector.lengthBytes,
          });

          expect(Hex.encode(Redacted.value(result))).toBe(argon2Vector.expectedHex);
          expect(Hex.encode(password)).toBe(argon2Vector.passwordHex);
        }).pipe(Effect.provide(backend.layer)),
      );
    }
  });
}
