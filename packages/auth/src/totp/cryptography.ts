import * as Cause from "effect/Cause";
import * as Aead from "effect/crypto/Aead";
import * as Digest from "effect/crypto/Digest";
import * as Mac from "effect/crypto/Mac";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { TokenDigest } from "../Schema";
import { TotpUnavailable } from "./errors";
import { TotpSecretBinding, TotpSecretEnvelope } from "./models";
import { TotpSecretKeys } from "./TotpSecretKeys";

const encoder = new TextEncoder();
const bindingCodec = Schema.fromJsonString(TotpSecretBinding);
const fail = () => TotpUnavailable.make({});

/** RFC 6238 SHA-1 uses a big-endian 64-bit counter. */
const counterAt = (step: number) => {
  const bytes = new Uint8Array(8);

  new DataView(bytes.buffer).setBigUint64(0, BigInt(step), false);

  return bytes;
};

const codeFromMac = (mac: Uint8Array, digits = 6) => {
  const offset = mac[mac.length - 1]! & 15;

  const binary =
    ((mac[offset]! & 127) << 24) |
    (mac[offset + 1]! << 16) |
    (mac[offset + 2]! << 8) |
    mac[offset + 3]!;

  return String(binary % 10 ** digits).padStart(digits, "0");
};

export const codeAt = Effect.fn("Totp.codeAt")(function* (
  secret: Uint8Array,
  step: number,
  digits = 6,
) {
  const hmac = yield* Mac.Mac;
  const counter = yield* Effect.try({ try: () => counterAt(step), catch: fail });

  const key = yield* Mac.key(Mac.hmacSha1, secret).pipe(Effect.mapError(fail));
  const mac = yield* hmac.sign(key, counter).pipe(Effect.mapError(fail));

  try {
    return codeFromMac(mac, digits);
  } finally {
    mac.fill(0);
  }
});

export const make = Effect.gen(function* () {
  const crypto = yield* SecureRandom.SecureRandom;
  const digests = yield* Digest.Digest;
  const aead = yield* Aead.Aead;
  const hmac = yield* Mac.Mac;
  const keys = yield* TotpSecretKeys;

  const random = (size: number) =>
    crypto
      .randomBytes(size)
      .pipe(Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, fail))));

  const digest = (value: string) =>
    digests.digest(Digest.sha256, encoder.encode(value)).pipe(
      Effect.map((bytes) => TokenDigest.make(Base64Url.encode(bytes))),
      Effect.mapError(fail),
    );

  const recoveryDigest = (moduleId: string, subjectId: string, value: string) =>
    digest(
      `effect-auth/totp/recovery/v1/${moduleId.length}:${moduleId}/${subjectId.length}:${subjectId}/${value}`,
    );

  return {
    randomId: Effect.suspend(() => random(32)).pipe(Effect.map(Base64Url.encode)),
    digest,
    recoveryDigest,
    generateSecret: Effect.suspend(() => random(20)),
    matchCode: Effect.fn("Totp.matchCode")(function* (
      secret: Uint8Array,
      code: string,
      nowMillis: number,
      skew: number,
    ) {
      const current = Math.floor(nowMillis / 30000);
      let matched: number | null = null;
      let key: Mac.Key | undefined;

      for (let delta = -skew; delta <= skew; delta++) {
        const step = current + delta;

        if (step >= 0) {
          // The native key belongs only to this match window, including failure
          // and interruption. Do not retain decrypted secrets across requests.
          key ??= yield* Mac.key(Mac.hmacSha1, secret).pipe(
            Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, fail))),
          );
          const counter = yield* Effect.try({ try: () => counterAt(step), catch: fail });

          const mac = yield* hmac
            .sign(key, counter)
            .pipe(Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, fail))));

          try {
            if (Mac.timingSafeEqual(encoder.encode(codeFromMac(mac)), encoder.encode(code)))
              matched = step;
          } finally {
            mac.fill(0);
          }
        }
      }

      return matched;
    }, Effect.scoped),
    newRecoveryCodes: Effect.fn("Totp.newRecoveryCodes")(function* (
      moduleId: string,
      subjectId: string,
    ) {
      const codes: Array<string> = [],
        digests: Array<TokenDigest> = [];

      for (let index = 0; index < 10; index++) {
        const bytes = yield* random(16);

        const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();

        bytes.fill(0);
        const code = `rc1-${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}-${hex.slice(24, 32)}`;

        codes.push(code);
        digests.push(yield* recoveryDigest(moduleId, subjectId, code));
      }

      return { codes, digests };
    }),
    encryptSecret: Effect.fn("Totp.encryptSecret")(function* (
      binding: TotpSecretBinding,
      secret: Uint8Array,
    ) {
      const selected = yield* keys.current;

      if (secret.length !== 20) return yield* fail();
      const nonce = yield* random(12);

      const additionalData = yield* Schema.encodeEffect(bindingCodec)(binding).pipe(
        Effect.map(encoder.encode.bind(encoder)),
        Effect.mapError(fail),
      );

      const key = yield* Effect.try({ try: () => Redacted.value(selected.key), catch: fail }).pipe(
        Effect.flatMap((bytes) => Aead.key(Aead.aes256Gcm, bytes)),
        Effect.mapError(fail),
      );

      const ciphertext = yield* aead
        .encrypt(key, secret, { nonce, aad: additionalData })
        .pipe(Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, fail))));

      return yield* Schema.decodeEffect(TotpSecretEnvelope)({
        keyId: selected.keyId,
        revision: binding.revision,
        nonce: Base64Url.encode(nonce),
        ciphertext: Base64Url.encode(ciphertext),
      }).pipe(Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, fail))));
    }),
    decryptSecret: Effect.fn("Totp.decryptSecret")(function* (
      binding: TotpSecretBinding,
      envelope: TotpSecretEnvelope,
    ) {
      const key = yield* keys.get(envelope.keyId);

      if (envelope.revision !== binding.revision) return yield* fail();

      const nonce = yield* Effect.fromResult(Base64Url.decode(envelope.nonce)).pipe(
        Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, fail))),
      );

      const ciphertext = yield* Effect.fromResult(Base64Url.decode(envelope.ciphertext)).pipe(
        Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, fail))),
      );

      const additionalData = yield* Schema.encodeEffect(bindingCodec)(binding).pipe(
        Effect.map(encoder.encode.bind(encoder)),
        Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, fail))),
      );

      const imported = yield* Effect.try({ try: () => Redacted.value(key), catch: fail }).pipe(
        Effect.flatMap((bytes) => Aead.key(Aead.aes256Gcm, bytes)),
        Effect.mapError(fail),
      );

      const secret = yield* aead
        .decrypt(imported, ciphertext, { nonce, aad: additionalData })
        .pipe(Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, fail))));

      if (secret.length !== 20) {
        secret.fill(0);

        return yield* fail();
      }

      return secret;
    }),
  };
});
