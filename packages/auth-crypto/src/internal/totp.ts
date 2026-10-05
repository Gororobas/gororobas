// oxlint-disable-next-line import/extensions -- Noble public ESM entrypoint.
import { gcm } from "@noble/ciphers/aes.js";
// oxlint-disable-next-line import/extensions -- Noble constant-time comparison.
import { equalBytes } from "@noble/ciphers/utils.js";
// oxlint-disable-next-line import/extensions -- Noble public ESM entrypoint.
import { hmac } from "@noble/hashes/hmac.js";
// oxlint-disable-next-line import/extensions -- RFC 6238 interoperable SHA-1 HMAC, not password hashing.
import { sha1 } from "@noble/hashes/legacy.js";
// oxlint-disable-next-line import/extensions -- Constant-time comparison and secure entropy.
import { randomBytes } from "@noble/hashes/utils.js";
import {
  TotpCryptography,
  TotpUnavailable,
  TotpSecretBinding,
  TotpSecretEnvelope,
  TotpSecretKeys,
} from "@yielded/auth/Totp";
import { Effect, Layer, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { digest, randomId } from "./primitives";

const encoder = new TextEncoder();
const bindingCodec = Schema.fromJsonString(TotpSecretBinding);

export const recoveryDigest = (moduleId: string, subjectId: string, value: string) =>
  digest(
    `effect-auth/totp/recovery/v1/${moduleId.length}:${moduleId}/${subjectId.length}:${subjectId}/${value}`,
  );

/** RFC 6238 counter uses big endian unsigned 64 bits and six displayed digits. */
export const codeAt = (secret: Uint8Array, step: number, digits = 6): string => {
  const counter = new Uint8Array(8);

  new DataView(counter.buffer).setBigUint64(0, BigInt(step), false);

  const mac = hmac(sha1, secret, counter),
    offset = mac[mac.length - 1]! & 15;

  const binary =
    ((mac[offset]! & 127) << 24) |
    (mac[offset + 1]! << 16) |
    (mac[offset + 2]! << 8) |
    mac[offset + 3]!;

  return String(binary % 10 ** digits).padStart(digits, "0");
};

export const matchCode = (secret: Uint8Array, code: string, nowMillis: number, skew: number) => {
  const current = Math.floor(nowMillis / 30000);
  let matched: number | null = null;

  for (let delta = -skew; delta <= skew; delta++) {
    const step = current + delta;

    if (step >= 0 && equalBytes(encoder.encode(codeAt(secret, step)), encoder.encode(code)))
      matched = step;
  }

  return matched;
};

export const newRecoveryCodes = (moduleId: string, subjectId: string) => {
  const codes = Array.from({ length: 10 }, () => {
    const hex = Array.from(randomBytes(16), (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    return `rc1-${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}-${hex.slice(24, 32)}`;
  });

  return { codes, digests: codes.map((code) => recoveryDigest(moduleId, subjectId, code)) };
};

const fail = () => TotpUnavailable.make({});

export const encryptSecret = Effect.fn("Totp.encryptSecret")(function* (
  binding: TotpSecretBinding,
  secret: Uint8Array,
) {
  const keys = yield* TotpSecretKeys,
    selected = yield* keys.current;

  return yield* Effect.try({
    try: () => {
      const key = Redacted.value(selected.key);

      if (key.length !== 32 || secret.length !== 20) throw fail();

      const nonce = randomBytes(12),
        aad = encoder.encode(Schema.encodeSync(bindingCodec)(binding));

      return TotpSecretEnvelope.make({
        keyId: selected.keyId,
        revision: binding.revision,
        nonce: Base64Url.encode(nonce),
        ciphertext: Base64Url.encode(gcm(key, nonce, aad).encrypt(secret)),
      });
    },
    catch: fail,
  });
});

export const decryptSecret = Effect.fn("Totp.decryptSecret")(function* (
  binding: TotpSecretBinding,
  envelope: TotpSecretEnvelope,
) {
  const keys = yield* TotpSecretKeys,
    wrapped = yield* keys.get(envelope.keyId);

  const nonce = yield* Effect.fromResult(Base64Url.decode(envelope.nonce)).pipe(
    Effect.mapError(fail),
  );

  const ciphertext = yield* Effect.fromResult(Base64Url.decode(envelope.ciphertext)).pipe(
    Effect.mapError(fail),
  );

  return yield* Effect.try({
    try: () => {
      const key = Redacted.value(wrapped);

      if (key.length !== 32 || envelope.revision !== binding.revision) throw fail();

      const secret = gcm(
        key,
        nonce,
        encoder.encode(Schema.encodeSync(bindingCodec)(binding)),
      ).decrypt(ciphertext);

      if (secret.length !== 20) throw fail();

      return secret;
    },
    catch: fail,
  });
});

export const generateSecret = () => randomBytes(20);

export const layer = Layer.effect(
  TotpCryptography,
  Effect.gen(function* () {
    const keys = yield* TotpSecretKeys;

    return TotpCryptography.of({
      randomId,
      digest,
      recoveryDigest,
      generateSecret,
      matchCode,
      newRecoveryCodes,
      encryptSecret: (binding, secret) =>
        encryptSecret(binding, secret).pipe(Effect.provideService(TotpSecretKeys, keys)),
      decryptSecret: (binding, envelope) =>
        decryptSecret(binding, envelope).pipe(Effect.provideService(TotpSecretKeys, keys)),
    });
  }),
);
