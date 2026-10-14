import type { Signature } from "@yielded/crypto/Signature";
import { Clock, Effect, Redacted, Schema } from "effect";

import { ClaimValidationFailed, type VerifyError } from "./Errors";
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
import type { PublicKey, SigningKey, VerificationKey } from "./Jwk";
import type { Jwks } from "./Jwks";
import { type Header, type Requirements, VerifyOptions as JwsVerifyOptions } from "./Jws";
import * as Jws from "./Jws";

export const RegisteredClaims = Schema.Struct({
  iss: Schema.optionalKey(Schema.String),
  sub: Schema.optionalKey(Schema.String),
  aud: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  exp: Schema.optionalKey(Schema.Finite),
  nbf: Schema.optionalKey(Schema.Finite),
  iat: Schema.optionalKey(Schema.Finite),
  jti: Schema.optionalKey(Schema.String),
});

export type RegisteredClaims = typeof RegisteredClaims.Type;

const expected = Schema.Union([
  Schema.String,
  Schema.Array(Schema.String).check(Schema.isMinLength(1)),
]);

const seconds = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0));

export const VerifyOptions = Schema.Struct({
  ...JwsVerifyOptions.fields,
  issuer: Schema.optionalKey(expected),
  audience: Schema.optionalKey(expected),
  subject: Schema.optionalKey(Schema.String),
  typ: Schema.optionalKey(Schema.NonEmptyString),
  clockTolerance: Schema.optionalKey(seconds),
  maxTokenAge: Schema.optionalKey(seconds),
  requiredClaims: Schema.optionalKey(
    Schema.Array(Schema.Literals(["iss", "sub", "aud", "exp", "nbf", "iat", "jti"])),
  ),
});

export type VerifyOptions = typeof VerifyOptions.Type;

export interface Verified<A> {
  readonly claims: A;
  readonly registeredClaims: RegisteredClaims;
  readonly protectedHeader: Header;
}

export type JwtError = VerifyError | ClaimValidationFailed | Schema.SchemaError;

const checkClaims = Effect.fnUntraced(function* (
  claims: Readonly<Record<string, Schema.Json>>,
  header: Header,
  options: VerifyOptions,
) {
  const registered = yield* Schema.decodeEffect(RegisteredClaims)(claims, {
    reportInput: false,
  }).pipe(
    Effect.mapError(() => ClaimValidationFailed.make({ claim: "registered", reason: "invalid" })),
  );

  for (const claim of options.requiredClaims ?? []) {
    if (registered[claim] === undefined)
      return yield* ClaimValidationFailed.make({ claim, reason: "missing" });
  }
  if (options.issuer !== undefined) {
    if (registered.iss === undefined)
      return yield* ClaimValidationFailed.make({ claim: "iss", reason: "missing" });
    const expected = typeof options.issuer === "string" ? [options.issuer] : options.issuer;

    if (!expected.includes(registered.iss))
      return yield* ClaimValidationFailed.make({ claim: "iss", reason: "mismatch" });
  }
  if (options.subject !== undefined) {
    if (registered.sub === undefined)
      return yield* ClaimValidationFailed.make({ claim: "sub", reason: "missing" });
    if (options.subject !== registered.sub)
      return yield* ClaimValidationFailed.make({ claim: "sub", reason: "mismatch" });
  }
  if (options.audience !== undefined) {
    if (registered.aud === undefined)
      return yield* ClaimValidationFailed.make({ claim: "aud", reason: "missing" });
    const expected = typeof options.audience === "string" ? [options.audience] : options.audience;
    const actual = typeof registered.aud === "string" ? [registered.aud] : registered.aud;

    if (!expected.some((audience) => actual.includes(audience)))
      return yield* ClaimValidationFailed.make({ claim: "aud", reason: "mismatch" });
  }

  const normalizedType = (value: string) => {
    const type = value.toLowerCase();

    return type.includes("/") ? type : `application/${type}`;
  };

  if (
    options.typ !== undefined &&
    (header.typ === undefined || normalizedType(header.typ) !== normalizedType(options.typ))
  )
    return yield* ClaimValidationFailed.make({ claim: "typ", reason: "mismatch" });
  const now = Math.floor((yield* Clock.currentTimeMillis) / 1000);
  const tolerance = options.clockTolerance ?? 0;

  if (registered.exp !== undefined && registered.exp <= now - tolerance)
    return yield* ClaimValidationFailed.make({ claim: "exp", reason: "expired" });
  if (registered.nbf !== undefined && registered.nbf > now + tolerance)
    return yield* ClaimValidationFailed.make({ claim: "nbf", reason: "notYetValid" });
  if (options.maxTokenAge !== undefined) {
    if (registered.iat === undefined)
      return yield* ClaimValidationFailed.make({ claim: "iat", reason: "missing" });
    if (registered.iat > now + tolerance)
      return yield* ClaimValidationFailed.make({ claim: "iat", reason: "future" });
    if (now - registered.iat - tolerance > options.maxTokenAge)
      return yield* ClaimValidationFailed.make({ claim: "iat", reason: "tooOld" });
  }

  return registered;
});

const decodeClaims = Effect.fnUntraced(function* <S extends Schema.Constraint>(
  schema: S,
  verified: Jws.Verified,
  options: VerifyOptions,
) {
  const wire = yield* json(yield* reveal(verified.payload), "payload");
  const registeredClaims = yield* checkClaims(wire, verified.protectedHeader, options);
  const claims = yield* Schema.decodeEffect(schema)(wire, { reportInput: false });

  return { claims, registeredClaims, protectedHeader: verified.protectedHeader } satisfies Verified<
    S["Type"]
  >;
});

export const sign = Effect.fnUntraced(function* <S extends Schema.Constraint>(
  schema: S,
  claims: S["Type"],
  key: SigningKey,
  header: Header,
): Effect.fn.Return<Redacted.Redacted<string>, JwtError, Requirements | S["EncodingServices"]> {
  const encoded = yield* Schema.encodeEffect(schema)(claims, { reportInput: false });
  const wire = yield* Schema.decodeUnknownEffect(JsonObject)(encoded, { reportInput: false });

  yield* Schema.decodeEffect(RegisteredClaims)(wire, { reportInput: false });

  return yield* Jws.sign(Redacted.make(utf8(yield* stringify(wire))), key, header);
});

export const verify = Effect.fnUntraced(function* <S extends Schema.Constraint>(
  schema: S,
  token: Redacted.Redacted<string>,
  key: VerificationKey,
  options: VerifyOptions,
): Effect.fn.Return<Verified<S["Type"]>, JwtError, Requirements | S["DecodingServices"]> {
  // Capture all policy before asynchronous cryptography or key resolution.
  const policy = yield* parse(VerifyOptions, options, "parameters");

  return yield* decodeClaims(schema, yield* Jws.verify(token, key, policy), policy);
});

export const verifyWithKeySet = Effect.fnUntraced(function* <S extends Schema.Constraint>(
  schema: S,
  token: Redacted.Redacted<string>,
  options: VerifyOptions,
): Effect.fn.Return<
  Verified<S["Type"]> & { readonly key: PublicKey },
  JwtError,
  Signature | Jwks | S["DecodingServices"]
> {
  const policy = yield* parse(VerifyOptions, options, "parameters");
  const jws = yield* Jws.verifyWithKeySet(token, policy);

  return { ...(yield* decodeClaims(schema, jws, policy)), key: jws.key };
});

/** Parsing only. This result does not establish authenticity or validate claims. */
export const decodeUnverified = Effect.fnUntraced(function* (token: Redacted.Redacted<string>) {
  const [, payload] = yield* split(token, 3);
  const claims = yield* json(yield* decode(payload), "payload");

  return { _tag: "UnverifiedJwt", claims: Redacted.make(claims) } as const;
});
