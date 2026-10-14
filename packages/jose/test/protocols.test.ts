import { it } from "@effect/vitest";
import { Jwe, Jwk, Jws } from "@yielded/jose";
import { Crypto, Effect, PlatformError, Redacted } from "effect";
import * as jose from "jose";
import { expect } from "vite-plus/test";

import { cryptoLayer, privateJwk, secret, secretJwk, text, utf8 } from "./fixtures";

// Selected panva/jose compact, critical-header, and key-import contracts adapted
// to public Effect workflows; see THIRD_PARTY_NOTICES.md. Independent signatures
// are necessary because an implementation can round-trip its own wire mistakes.
for (const algorithm of ["RS256", "PS256", "ES256", "EdDSA"] as const) {
  it.effect(`interoperates in both directions with ${algorithm} JWKs and compact JWS`, () =>
    Effect.gen(function* () {
      const pair = yield* Effect.promise(() =>
        jose.generateKeyPair(algorithm, { extractable: true }),
      );

      const originalPrivate = yield* Effect.promise(() => jose.exportJWK(pair.privateKey));
      const originalPublic = yield* Effect.promise(() => jose.exportJWK(pair.publicKey));
      const signing = yield* Jwk.importPrivate(Redacted.make(originalPrivate), algorithm);
      const verifying = yield* Jwk.importPublic(originalPublic, algorithm);

      expect(Redacted.value(yield* Jwk.exportPrivate(signing))).toEqual(originalPrivate);
      expect(yield* Jwk.exportPublic(verifying)).toEqual(originalPublic);
      const ours = yield* Jws.sign(Redacted.make(utf8("message")), signing, { alg: algorithm });

      const upstream = yield* Effect.promise(() =>
        jose.compactVerify(Redacted.value(ours), pair.publicKey, { algorithms: [algorithm] }),
      );

      expect(text(upstream.payload)).toBe("message");

      const theirs = yield* Effect.promise(() =>
        new jose.CompactSign(utf8("message"))
          .setProtectedHeader({ alg: algorithm })
          .sign(pair.privateKey),
      );

      const verified = yield* Jws.verify(Redacted.make(theirs), verifying, {
        algorithms: [algorithm],
      });

      expect(text(Redacted.value(verified.payload))).toBe("message");
    }).pipe(Effect.provide(cryptoLayer)),
  );
}

it.effect("interoperates with HS256, including an empty compact payload", () =>
  Effect.gen(function* () {
    const key = yield* Jwk.importSecret(Redacted.make(secretJwk), "HS256");
    const ours = yield* Jws.sign(Redacted.make(new Uint8Array()), key, { alg: "HS256" });
    const result = yield* Effect.promise(() => jose.compactVerify(Redacted.value(ours), secret));

    expect(result.payload).toHaveLength(0);

    const theirs = yield* Effect.promise(() =>
      new jose.CompactSign(utf8("payload")).setProtectedHeader({ alg: "HS256" }).sign(secret),
    );

    expect(
      text(
        Redacted.value(
          (yield* Jws.verify(Redacted.make(theirs), key, { algorithms: ["HS256"] })).payload,
        ),
      ),
    ).toBe("payload");
  }).pipe(Effect.provide(cryptoLayer)),
);

it.effect("denies asymmetric signing with a verify-only key", () =>
  Effect.gen(function* () {
    const restricted = yield* Jwk.importPrivate(
      Redacted.make({ ...privateJwk, key_ops: ["verify"] }),
      "ES256",
    );

    expect(
      (yield* Jws.sign(Redacted.make(utf8("payload")), restricted, { alg: "ES256" }).pipe(
        Effect.flip,
      ))._tag,
    ).toBe("JoseInvalidKey");
  }).pipe(Effect.provide(cryptoLayer)),
);

it.effect("rejects payload tampering and disallowed algorithms", () =>
  Effect.gen(function* () {
    const key = yield* Jwk.importSecret(Redacted.make(secretJwk), "HS256");

    const token = yield* Effect.promise(() =>
      new jose.CompactSign(utf8("payload")).setProtectedHeader({ alg: "HS256" }).sign(secret),
    );

    const parts = token.split(".");

    const tampered = Redacted.make(`${parts[0]}.${jose.base64url.encode("different")}.${parts[2]}`);

    expect(
      (yield* Jws.verify(tampered, key, { algorithms: ["HS256"] }).pipe(Effect.flip))._tag,
    ).toBe("JoseSignatureVerificationFailed");
    expect(
      (yield* Jws.verify(Redacted.make(token), key, { algorithms: ["RS256"] }).pipe(Effect.flip))
        ._tag,
    ).toBe("JoseAlgorithmNotAllowed");
  }).pipe(Effect.provide(cryptoLayer)),
);

// Reproduced at 5199d99: RNG PlatformError escaped JweError with its native cause.
it.effect("classifies JWE RNG failures without exposing native causes", () =>
  Effect.gen(function* () {
    const key = yield* Jwk.importSecret(Redacted.make(secretJwk), "dir");
    const random = yield* Crypto.Crypto;

    const error = yield* Jwe.encrypt(Redacted.make(utf8("payload")), key, {
      alg: "dir",
      enc: "A256GCM",
    }).pipe(
      Effect.provideService(Crypto.Crypto, {
        ...random,
        randomBytes: () =>
          Effect.fail(
            PlatformError.systemError({
              _tag: "Unknown",
              module: "Crypto",
              method: "randomBytes",
              cause: "private-rng-canary",
            }),
          ),
      }),
      Effect.flip,
    );

    expect(error._tag).toBe("CryptoUnavailable");
    expect(JSON.stringify(error)).not.toContain("private-rng-canary");
    expect(String(error)).not.toContain("private-rng-canary");
  }).pipe(Effect.provide(cryptoLayer)),
);

it.effect(
  "interoperates with compact dir/A256GCM and authenticates the header, ciphertext and tag",
  () =>
    Effect.gen(function* () {
      const key = yield* Jwk.importSecret(
        Redacted.make({ ...secretJwk, use: "enc", key_ops: ["encrypt", "decrypt"] }),
        "dir",
      );

      const plaintext = "It’s a dangerous business, Frodo, going out your door.";

      const theirs = yield* Effect.promise(() =>
        new jose.CompactEncrypt(utf8(plaintext))
          .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
          .setInitializationVector(new Uint8Array(12))
          .encrypt(secret),
      );

      const decoded = yield* Jwe.decrypt(Redacted.make(theirs), key);

      expect(text(Redacted.value(decoded.plaintext))).toBe(plaintext);

      const ours = yield* Jwe.encrypt(Redacted.make(utf8(plaintext)), key, {
        alg: "dir",
        enc: "A256GCM",
      });

      const independent = yield* Effect.promise(() =>
        jose.compactDecrypt(Redacted.value(ours), secret),
      );

      expect(text(independent.plaintext)).toBe(plaintext);
      const parts = theirs.split(".");

      for (const changed of [
        [
          jose.base64url.encode(JSON.stringify({ alg: "dir", enc: "A256GCM", kid: "changed" })),
          ...parts.slice(1),
        ].join("."),
        [...parts.slice(0, 3), jose.base64url.encode(utf8("changed")), parts[4]].join("."),
        [...parts.slice(0, 4), jose.base64url.encode(new Uint8Array(16))].join("."),
      ]) {
        expect((yield* Jwe.decrypt(Redacted.make(changed), key).pipe(Effect.flip))._tag).toBe(
          "JoseDecryptionFailed",
        );
      }
    }).pipe(Effect.provide(cryptoLayer)),
);
