import { Aead } from "@yielded/crypto/Aead";
import { CryptoUnavailable, type OperationError } from "@yielded/crypto/Errors";
import { Crypto, Effect, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { DecryptionFailed, InvalidKey, InvalidToken } from "./Errors";
import {
  decode,
  json,
  JsonObject,
  parse,
  reveal,
  split,
  stringify,
  utf8,
} from "./internal/encoding";
import * as KeyPolicy from "./internal/keyPolicy";
import type { SecretKey } from "./Jwk";

export const Header = Schema.Struct({
  alg: Schema.Literal("dir"),
  enc: Schema.Literal("A256GCM"),
  kid: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  typ: Schema.optionalKey(Schema.NonEmptyString),
  cty: Schema.optionalKey(Schema.NonEmptyString),
});

export type Header = typeof Header.Type;
export type JweError = InvalidToken | InvalidKey | OperationError | DecryptionFailed;

const readHeader = Effect.fnUntraced(function* (input: unknown) {
  const raw = yield* parse(JsonObject, input, "header");

  if (raw.crit !== undefined || raw.zip !== undefined)
    return yield* InvalidToken.make({ reason: "header" });

  return yield* parse(Header, raw, "header");
});

/** Generates a fresh 96-bit IV; random-source failures become CryptoUnavailable. */
export const encrypt = Effect.fnUntraced(function* (
  plaintext: Redacted.Redacted<Uint8Array>,
  key: SecretKey,
  input: Header,
): Effect.fn.Return<Redacted.Redacted<string>, JweError, Aead | Crypto.Crypto> {
  const header = yield* readHeader(input);

  if (key.algorithm !== "dir") return yield* InvalidKey.make({});
  yield* KeyPolicy.check(yield* reveal(key.jwk), "dir", "encrypt");
  yield* parse(
    Schema.Uint8Array.check(Schema.isMaxLength(45000)),
    yield* reveal(plaintext),
    "payload",
  );

  const protectedPart = Base64Url.encode(
    yield* stringify(header).pipe(Effect.mapError(() => InvalidToken.make({ reason: "header" }))),
  );

  if (protectedPart.length > 4096) return yield* InvalidToken.make({ reason: "header" });
  const random = yield* Crypto.Crypto;

  const nonce = yield* random
    .randomBytes(12)
    .pipe(Effect.mapError(() => CryptoUnavailable.make({})));

  const aead = yield* Aead;

  const sealed = yield* aead.encrypt({
    algorithm: "AES-256-GCM",
    key: key.material,
    nonce,
    plaintext,
    additionalData: utf8(protectedPart),
  });

  return Redacted.make(
    `${protectedPart}..${Base64Url.encode(nonce)}.${Base64Url.encode(sealed.subarray(0, -16))}.${Base64Url.encode(sealed.subarray(-16))}`,
  );
});

export const decrypt = Effect.fnUntraced(function* (
  token: Redacted.Redacted<string>,
  key: SecretKey,
) {
  const [protectedPart, encryptedKey, iv, ciphertext, tag] = yield* split(token, 5);

  if (encryptedKey !== "" || protectedPart.length > 4096)
    return yield* InvalidToken.make({ reason: "serialization" });
  const protectedHeader = yield* readHeader(yield* json(yield* decode(protectedPart), "header"));

  if (key.algorithm !== "dir") return yield* InvalidKey.make({});
  yield* KeyPolicy.check(yield* reveal(key.jwk), "dir", "decrypt");
  const nonce = yield* decode(iv);
  const data = yield* decode(ciphertext);
  const authTag = yield* decode(tag);

  if (nonce.length !== 12 || authTag.length !== 16)
    return yield* InvalidToken.make({ reason: "serialization" });
  const sealed = new Uint8Array(data.length + authTag.length);

  sealed.set(data);
  sealed.set(authTag, data.length);
  const aead = yield* Aead;

  const plaintext = yield* aead
    .decrypt({
      algorithm: "AES-256-GCM",
      key: key.material,
      nonce,
      ciphertext: sealed,
      additionalData: utf8(protectedPart),
    })
    .pipe(Effect.catchTag("CryptoAuthenticationFailed", () => DecryptionFailed.make({})));

  return { protectedHeader, plaintext };
});
