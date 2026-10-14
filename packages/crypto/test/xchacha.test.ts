import { it } from "@effect/vitest";
import { Aead } from "@yielded/crypto/Aead";
import * as KdfAdmission from "@yielded/crypto/KdfAdmission";
import * as Portable from "@yielded/crypto/Portable";
import { Effect, Layer, Redacted, Schema } from "effect";
import { Hex } from "effect/encoding";
import { expect } from "vite-plus/test";

import { xchachaVectors } from "./fixtures/xchacha-vectors";

const bytes = Schema.decodeSync(Schema.Uint8ArrayFromHex);

const layer = Portable.layer(globalThis.crypto.subtle).pipe(Layer.provide(KdfAdmission.layer()));

// Requested upstream port: retain every Wycheproof XChaCha case before replacing
// the dependency. These independent outputs cover Poly1305 arithmetic/carries,
// block boundaries, nonce validation and authentication failures.
for (const vector of xchachaVectors) {
  it.effect(`Wycheproof XChaCha tcId ${vector.tcId}: ${vector.comment}`, () =>
    Effect.gen(function* () {
      const aead = yield* Aead;
      const key = bytes(vector.key);
      const plaintext = bytes(vector.msg);

      const context = {
        algorithm: "XChaCha20-Poly1305" as const,
        key: Redacted.make(key),
        nonce: bytes(vector.iv),
        additionalData: bytes(vector.aad),
      };

      const sealed = bytes(vector.ct + vector.tag);

      if (vector.result === "valid") {
        const encrypted = yield* aead.encrypt({
          ...context,
          plaintext: Redacted.make(plaintext),
        });

        const decrypted = yield* aead.decrypt({ ...context, ciphertext: sealed });

        expect(Hex.encode(encrypted)).toBe(vector.ct + vector.tag);
        expect(Hex.encode(Redacted.value(decrypted))).toBe(vector.msg);
      } else {
        const failure = yield* aead.decrypt({ ...context, ciphertext: sealed }).pipe(Effect.flip);

        expect(failure._tag).toBe(
          vector.ivSize === 192 ? "CryptoAuthenticationFailed" : "CryptoInvalidInput",
        );
      }
      expect(Hex.encode(key)).toBe(vector.key);
      expect(Hex.encode(plaintext)).toBe(vector.msg);
      expect(Hex.encode(sealed)).toBe(vector.ct + vector.tag);
    }).pipe(Effect.provide(layer)),
  );
}
