import { generateKeyPairSync, verify } from "node:crypto";

import { it } from "@effect/vitest";
import { Signature } from "@yielded/crypto/Signature";
import { Effect, Redacted, Schema } from "effect";
import { Hex } from "effect/encoding";
import { describe, expect } from "vite-plus/test";

import { backends, utf8 } from "./backends";
import { ed25519PrivateKeyHex, signatureVectors } from "./vectors";

const bytes = Schema.decodeSync(Schema.Uint8ArrayFromHex);

// Adapted Wycheproof/RFC8032 behavior through public Effect APIs.
// Fixed independent verification fixtures catch serialization, padding and profile
// mistakes. Native cross-verification separately establishes the signing contract.
// See vectors.ts and ../THIRD_PARTY_NOTICES.md for exact revisions and notices.
for (const backend of backends) {
  describe(`${backend.name}`, () => {
    it.effect("verifies independent signatures and rejects invalid padding/profile values", () =>
      Effect.gen(function* () {
        const signatures = yield* Signature;

        for (const vector of signatureVectors) {
          const result = yield* signatures.verify({
            algorithm: vector.algorithm,
            publicKey: bytes(vector.publicKeySpkiHex),
            data: bytes(vector.messageHex),
            signature: bytes(vector.signatureHex),
          });

          expect(result, `${vector.algorithm}: ${vector.source}`).toBe(vector.expectedValid);
        }
      }).pipe(Effect.provide(backend.layer)),
    );

    it.effect("signs the deterministic RFC8032 Ed25519 vector", () =>
      Effect.gen(function* () {
        const signatures = yield* Signature;
        const vector = signatureVectors.find((value) => value.algorithm === "Ed25519")!;

        const result = yield* signatures.sign({
          algorithm: "Ed25519",
          privateKey: Redacted.make(bytes(ed25519PrivateKeyHex)),
          data: bytes(vector.messageHex),
        });

        expect(Hex.encode(result)).toBe(vector.signatureHex);
      }).pipe(Effect.provide(backend.layer)),
    );

    it.effect("signs ECDSA P1363 and RSA with the explicit native verification profile", () =>
      Effect.gen(function* () {
        const signatures = yield* Signature;
        const data = utf8("cross-implementation message");

        const ec = yield* Effect.sync(() =>
          generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
        );

        const ecSignature = yield* signatures.sign({
          algorithm: "ECDSA-P256-SHA256",
          privateKey: Redacted.make(ec.privateKey.export({ type: "pkcs8", format: "der" })),
          data,
        });

        expect(ecSignature).toHaveLength(64);
        expect(
          verify("sha256", data, { key: ec.publicKey, dsaEncoding: "ieee-p1363" }, ecSignature),
        ).toBe(true);

        const rsa = yield* Effect.sync(() => generateKeyPairSync("rsa", { modulusLength: 2048 }));

        for (const algorithm of ["RSASSA-PKCS1-v1_5-SHA256", "RSA-PSS-SHA256"] as const) {
          const rsaSignature = yield* signatures.sign({
            algorithm,
            privateKey: Redacted.make(rsa.privateKey.export({ type: "pkcs8", format: "der" })),
            data,
          });

          expect(
            verify(
              "sha256",
              data,
              {
                key: rsa.publicKey,
                padding: algorithm === "RSA-PSS-SHA256" ? 6 : 1,
                saltLength: 32,
              },
              rsaSignature,
            ),
          ).toBe(true);
        }
      }).pipe(Effect.provide(backend.layer)),
    );

    it.effect("rejects RSA keys below the advertised 2048-bit minimum", () =>
      Effect.gen(function* () {
        const signatures = yield* Signature;
        const rsa = yield* Effect.sync(() => generateKeyPairSync("rsa", { modulusLength: 1024 }));

        const result = yield* signatures
          .sign({
            algorithm: "RSASSA-PKCS1-v1_5-SHA256",
            privateKey: Redacted.make(rsa.privateKey.export({ type: "pkcs8", format: "der" })),
            data: utf8("data"),
          })
          .pipe(Effect.flip);

        expect(result).toMatchObject({ _tag: "CryptoInvalidInput", reason: "key" });
      }).pipe(Effect.provide(backend.layer)),
    );
  });
}
