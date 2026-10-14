import { Hmac } from "@yielded/crypto/Hmac";
import { Signature } from "@yielded/crypto/Signature";
import { Effect, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import {
  AlgorithmNotAllowed,
  InvalidKey,
  InvalidToken,
  SignatureVerificationFailed,
} from "./Errors";
import { algorithms } from "./internal/algorithms";
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
import {
  Algorithm,
  type SigningKey,
  type VerificationKey,
  type PublicKey,
  type PrivateJwk,
  type SecretJwk,
} from "./Jwk";
import { Jwks } from "./Jwks";

export const Header = Schema.Struct({
  alg: Algorithm,
  kid: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  typ: Schema.optionalKey(Schema.NonEmptyString),
  cty: Schema.optionalKey(Schema.NonEmptyString),
});

export type Header = typeof Header.Type;

export const VerifyOptions = Schema.Struct({
  algorithms: Schema.Array(Algorithm).check(Schema.isMinLength(1)),
});

export type VerifyOptions = typeof VerifyOptions.Type;

export interface Verified {
  readonly protectedHeader: Header;
  readonly payload: Redacted.Redacted<Uint8Array>;
}

export type Requirements = Hmac | Signature;

const readHeader = Effect.fnUntraced(function* (input: unknown) {
  const raw = yield* parse(JsonObject, input, "header");

  // No extension handlers are installed. These options change authenticated
  // processing and may never be silently stripped by the structural schema.
  if (raw.crit !== undefined || raw.b64 !== undefined)
    return yield* InvalidToken.make({ reason: "header" });

  return yield* parse(Header, raw, "header");
});

const parseCompact = Effect.fnUntraced(function* (
  token: Redacted.Redacted<string>,
  options: VerifyOptions,
) {
  const policy = yield* parse(VerifyOptions, options, "parameters");
  const [protectedPart, payloadPart, signaturePart] = yield* split(token, 3);

  if (protectedPart.length > 4096) return yield* InvalidToken.make({ reason: "header" });
  const protectedHeader = yield* readHeader(yield* json(yield* decode(protectedPart), "header"));

  if (!policy.algorithms.includes(protectedHeader.alg)) return yield* AlgorithmNotAllowed.make({});
  const payload = yield* decode(payloadPart);
  const signature = yield* decode(signaturePart);

  return {
    protectedHeader,
    payload,
    signature,
    signingInput: utf8(`${protectedPart}.${payloadPart}`),
  };
});

const verifyAsymmetric = Effect.fnUntraced(function* (
  parsed: Effect.Success<ReturnType<typeof parseCompact>>,
  key: PublicKey,
) {
  const algorithm = parsed.protectedHeader.alg;

  if (algorithm === "HS256" || key.algorithm !== algorithm) return yield* InvalidKey.make({});
  yield* KeyPolicy.check(key.jwk, algorithm, "verify");
  const signatures = yield* Signature;

  const valid = yield* signatures.verify({
    algorithm: algorithms[algorithm],
    publicKey: key.material,
    data: parsed.signingInput,
    signature: parsed.signature,
  });

  if (!valid) return yield* SignatureVerificationFailed.make({});

  return {
    protectedHeader: parsed.protectedHeader,
    payload: Redacted.make(parsed.payload),
  } satisfies Verified;
});

export const sign = Effect.fnUntraced(function* (
  payload: Redacted.Redacted<Uint8Array>,
  key: SigningKey,
  input: Header,
) {
  const header = yield* readHeader(input);

  if (key.algorithm !== header.alg) return yield* InvalidKey.make({});
  yield* KeyPolicy.check(yield* reveal<PrivateJwk | SecretJwk>(key.jwk), header.alg, "sign");

  const data = yield* parse(
    Schema.Uint8Array.check(Schema.isMaxLength(45000)),
    yield* reveal(payload),
    "payload",
  );

  const protectedPart = Base64Url.encode(
    yield* stringify(header).pipe(Effect.mapError(() => InvalidToken.make({ reason: "header" }))),
  );

  if (protectedPart.length > 4096) return yield* InvalidToken.make({ reason: "header" });
  const signingInput = `${protectedPart}.${Base64Url.encode(data)}`;
  let signature: Uint8Array;

  if (key._tag === "SecretKey") {
    if (header.alg !== "HS256") return yield* InvalidKey.make({});
    const hmac = yield* Hmac;

    signature = yield* hmac.sign({
      algorithm: "SHA-256",
      key: key.material,
      data: utf8(signingInput),
    });
  } else {
    if (header.alg === "HS256") return yield* InvalidKey.make({});
    const signatures = yield* Signature;

    signature = yield* signatures.sign({
      algorithm: algorithms[header.alg],
      privateKey: key.material,
      data: utf8(signingInput),
    });
  }

  return Redacted.make(`${signingInput}.${Base64Url.encode(signature)}`);
});

export const verify = Effect.fnUntraced(function* (
  token: Redacted.Redacted<string>,
  key: VerificationKey,
  options: VerifyOptions,
) {
  const parsed = yield* parseCompact(token, options);

  if (key._tag !== "SecretKey") return yield* verifyAsymmetric(parsed, key);
  const algorithm = parsed.protectedHeader.alg;

  if (key.algorithm !== algorithm) return yield* InvalidKey.make({});
  yield* KeyPolicy.check(yield* reveal(key.jwk), algorithm, "verify");
  if (algorithm !== "HS256") return yield* InvalidKey.make({});
  const hmac = yield* Hmac;

  const valid = yield* hmac.verify({
    algorithm: "SHA-256",
    key: key.material,
    data: parsed.signingInput,
    tag: parsed.signature,
  });

  if (!valid) return yield* SignatureVerificationFailed.make({});

  return {
    protectedHeader: parsed.protectedHeader,
    payload: Redacted.make(parsed.payload),
  } satisfies Verified;
});

export const verifyWithKeySet = Effect.fnUntraced(function* (
  token: Redacted.Redacted<string>,
  options: VerifyOptions,
) {
  const parsed = yield* parseCompact(token, options);

  if (parsed.protectedHeader.alg === "HS256") return yield* InvalidKey.make({});
  const keys = yield* Jwks;

  const key = yield* keys.resolve({
    algorithm: parsed.protectedHeader.alg,
    ...(parsed.protectedHeader.kid === undefined ? {} : { kid: parsed.protectedHeader.kid }),
  });

  const verified = yield* verifyAsymmetric(parsed, key);

  return { ...verified, key };
});
