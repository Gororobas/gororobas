import { it } from "@effect/vitest";
import { Aead, EncryptInput } from "@yielded/crypto/Aead";
import { Hmac } from "@yielded/crypto/Hmac";
import { Kdf } from "@yielded/crypto/Kdf";
import * as KdfAdmission from "@yielded/crypto/KdfAdmission";
import * as Portable from "@yielded/crypto/Portable";
import { Signature } from "@yielded/crypto/Signature";
import * as WebCrypto from "@yielded/crypto/WebCrypto";
import { Effect, Layer, Redacted, Schema } from "effect";
import { describe, expect } from "vite-plus/test";

import { backends, utf8 } from "./backends";

it.effect("refuses JSON serialization of secret-bearing crypto inputs", () =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeEffect(Schema.toCodecJson(EncryptInput))({
      algorithm: "AES-256-GCM",
      key: Redacted.make(new Uint8Array(32)),
      nonce: new Uint8Array(12),
      plaintext: Redacted.make(utf8("private plaintext")),
    }).pipe(Effect.result);

    expect(encoded._tag).toBe("Failure");
    expect(JSON.stringify(encoded)).not.toContain("private plaintext");
  }),
);

// These failures supplement independent vectors at the standalone service
// boundary: validation, capability classification and redacted diagnostics.
for (const backend of backends) {
  describe(`${backend.name}`, () => {
    it.effect("rejects invalid AEAD key and nonce lengths before encryption", () =>
      Effect.gen(function* () {
        const aead = yield* Aead;

        const input = {
          algorithm: "AES-256-GCM" as const,
          key: Redacted.make(new Uint8Array(32)),
          nonce: new Uint8Array(12),
          plaintext: Redacted.make(utf8("private plaintext")),
        };

        const key = yield* aead
          .encrypt({ ...input, key: Redacted.make(new Uint8Array(31)) })
          .pipe(Effect.flip);

        const nonce = yield* aead
          .encrypt({ ...input, nonce: new Uint8Array(16) })
          .pipe(Effect.flip);

        expect(key).toMatchObject({ _tag: "CryptoInvalidInput", reason: "key" });
        expect(nonce).toMatchObject({ _tag: "CryptoInvalidInput", reason: "nonce" });
      }).pipe(Effect.provide(backend.layer)),
    );

    it.effect(
      "rejects PBKDF2 input, iteration and output costs without exposing the password",
      () =>
        Effect.gen(function* () {
          const kdf = yield* Kdf;
          const password = Redacted.make(utf8("synthetic-secret-do-not-log"));
          const input = { password, salt: utf8("salt"), iterations: 1, length: 32 };

          for (const invalid of [
            { ...input, iterations: 0 },
            { ...input, iterations: 1000001 },
            { ...input, length: 1025 },
            { ...input, password: Redacted.make(new Uint8Array(65537)) },
          ]) {
            const failure = yield* kdf.pbkdf2(invalid).pipe(Effect.flip);

            expect(failure).toMatchObject({ _tag: "CryptoInvalidInput" });
            expect(JSON.stringify(failure)).not.toContain("synthetic-secret-do-not-log");
            expect(failure).not.toHaveProperty("cause");
          }
        }).pipe(Effect.provide(backend.layer)),
    );

    it.effect("treats malformed signature keys as invalid input, not an invalid credential", () =>
      Effect.gen(function* () {
        const signature = yield* Signature;

        const failure = yield* signature
          .verify({
            algorithm: "ECDSA-P256-SHA256",
            publicKey: utf8("not a DER key"),
            data: utf8("message"),
            signature: new Uint8Array(64),
          })
          .pipe(Effect.flip);

        expect(failure).toMatchObject({ _tag: "CryptoInvalidInput", reason: "key" });
      }).pipe(Effect.provide(backend.layer)),
    );

    if (backend.extended) {
      it.effect("bounds Argon2 memory, memory-times-passes and lanes before deriving", () =>
        Effect.gen(function* () {
          const kdf = yield* Kdf;

          const input = {
            password: Redacted.make(utf8("password")),
            salt: utf8("somesalt"),
            memoryKiB: 32,
            passes: 3,
            parallelism: 4,
            length: 32,
          };

          for (const invalid of [
            { ...input, memoryKiB: 65537 },
            { ...input, memoryKiB: 65536, passes: 3 },
            { ...input, memoryKiB: 31 },
            { ...input, parallelism: 5 },
            { ...input, salt: new Uint8Array(7) },
          ]) {
            expect(yield* kdf.argon2id(invalid).pipe(Effect.flip)).toMatchObject({
              _tag: "CryptoInvalidInput",
            });
          }
        }).pipe(Effect.provide(backend.layer)),
      );
    }
  });
}

it.effect(
  "WebCrypto declares Argon2id and XChaCha unsupported rather than silently substituting",
  () =>
    Effect.gen(function* () {
      const aead = yield* Aead;
      const kdf = yield* Kdf;

      const encryption = yield* aead
        .encrypt({
          algorithm: "XChaCha20-Poly1305",
          key: Redacted.make(new Uint8Array(32)),
          nonce: new Uint8Array(24),
          plaintext: Redacted.make(new Uint8Array()),
        })
        .pipe(Effect.flip);

      const derivation = yield* kdf
        .argon2id({
          password: Redacted.make(utf8("password")),
          salt: utf8("somesalt"),
          memoryKiB: 32,
          passes: 3,
          parallelism: 4,
          length: 32,
        })
        .pipe(Effect.flip);

      expect(encryption).toMatchObject({ _tag: "CryptoUnsupportedAlgorithm" });
      expect(derivation).toMatchObject({ _tag: "CryptoUnsupportedAlgorithm" });
    }).pipe(Effect.provide(backends[0]!.layer)),
);

for (const [name, tag] of [
  ["NotSupportedError", "CryptoUnsupportedAlgorithm"],
  ["OperationError", "CryptoUnavailable"],
] as const) {
  it.effect(`keeps native ${name} typed and secret-safe`, () => {
    const subtle = new Proxy(globalThis.crypto.subtle, {
      get(target, property) {
        if (property === "sign") {
          return () => Promise.reject(new DOMException("secret-native-diagnostic", name));
        }
        const value = Reflect.get(target, property, target);

        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    return Effect.gen(function* () {
      const hmac = yield* Hmac;

      const failure = yield* hmac
        .sign({
          algorithm: "SHA-256",
          key: Redacted.make(utf8("private-key-material")),
          data: utf8("data"),
        })
        .pipe(Effect.flip);

      expect(failure).toMatchObject({ _tag: tag });
      expect(JSON.stringify(failure)).not.toContain("secret-native-diagnostic");
      expect(failure).not.toHaveProperty("cause");
    }).pipe(Effect.provide(WebCrypto.layer(subtle).pipe(Layer.provide(KdfAdmission.layer()))));
  });
}

// Native profile bounds and erased secrets must fail through the typed channel.
it.effect("rejects HKDF context beyond the verified native 1024-byte profile", () =>
  Effect.gen(function* () {
    const kdf = yield* Kdf;

    const failure = yield* kdf
      .hkdf({
        key: Redacted.make(new Uint8Array([1])),
        salt: new Uint8Array(),
        info: new Uint8Array(1025),
        length: 32,
      })
      .pipe(Effect.flip);

    expect(failure).toMatchObject({ _tag: "CryptoInvalidInput" });
  }).pipe(Effect.provide(backends[0]!.layer)),
);

it.effect("returns a typed failure for a wiped secret before calling its backend", () =>
  Effect.gen(function* () {
    const hmac = yield* Hmac;
    const key = Redacted.make(new Uint8Array(32));

    Redacted.wipeUnsafe(key);

    const failure = yield* hmac
      .sign({ algorithm: "SHA-256", key, data: new Uint8Array() })
      .pipe(Effect.flip);

    expect(failure).toMatchObject({ _tag: "CryptoInvalidInput" });
  }).pipe(Effect.provide(backends[0]!.layer)),
);

it.effect("keeps absolute KDF bounds when application resource ceilings are raised", () =>
  Effect.gen(function* () {
    const kdf = yield* Kdf;
    const password = Redacted.make(new Uint8Array([1]));
    const salt = new Uint8Array(8);

    const pbkdf2 = yield* kdf
      .pbkdf2({ password, salt, iterations: 2 ** 32, length: 32 })
      .pipe(Effect.flip);

    const argon2 = yield* kdf
      .argon2id({ password, salt, memoryKiB: 8, passes: 2 ** 32, parallelism: 1, length: 32 })
      .pipe(Effect.flip);

    expect([pbkdf2, argon2]).toMatchObject([
      { _tag: "CryptoInvalidInput" },
      { _tag: "CryptoInvalidInput" },
    ]);
  }).pipe(
    Effect.provide(
      Portable.layer(globalThis.crypto.subtle, {
        maximumIterations: 2 ** 32,
        maximumPasses: 2 ** 32,
        maximumMemoryPasses: 8 * 2 ** 32,
      }).pipe(Layer.provide(KdfAdmission.layer())),
    ),
  ),
);

// Requested port review: Argon2 H0 encodes each byte length in uint32 even when
// resource limits are raised. Oversized reported lengths avoid a 4 GiB allocation.
it.effect("retains absolute Argon2 byte-length bounds independently of resource ceilings", () =>
  Effect.gen(function* () {
    const kdf = yield* Kdf;
    const oversized = new Uint8Array(8);

    Object.defineProperty(oversized, "length", { value: 2 ** 32 });

    const input = {
      password: Redacted.make(utf8("password")),
      salt: utf8("somesalt"),
      memoryKiB: 8,
      passes: 1,
      parallelism: 1,
      length: 32,
    };

    const outcomes = yield* Effect.forEach(
      [
        { ...input, password: Redacted.make(oversized) },
        { ...input, salt: oversized },
        { ...input, secret: Redacted.make(oversized) },
        { ...input, associatedData: oversized },
      ],
      (request) =>
        kdf
          .argon2id(request)
          .pipe(Effect.match({ onFailure: (error) => error._tag, onSuccess: () => "derived" })),
    );

    expect(outcomes).toEqual([
      "CryptoInvalidInput",
      "CryptoInvalidInput",
      "CryptoInvalidInput",
      "CryptoInvalidInput",
    ]);
  }).pipe(
    Effect.provide(
      Portable.layer(globalThis.crypto.subtle, { maximumInputBytes: 2 ** 32 }).pipe(
        Layer.provide(KdfAdmission.layer()),
      ),
    ),
  ),
);
