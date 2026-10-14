import { it } from "@effect/vitest";
import { Jwk, type Jws, Jwt } from "@yielded/jose";
import { Context, Effect, Redacted, Schema, SchemaGetter } from "effect";
import { TestClock } from "effect/testing";
import * as jose from "jose";
import { expect, expectTypeOf } from "vite-plus/test";

import { cryptoLayer, independentJwt, secret, secretJwk, utf8 } from "./fixtures";

// Adapted JWT verification contracts from panva/jose, plus the explicitly
// requested Schema inference and branded-subject boundary. See the shipped notices.
export const Subject = Schema.String.check(Schema.isPattern(/^user_[0-9]+$/)).pipe(
  Schema.brand("Subject"),
);

export const Claims = Schema.Struct({
  sub: Subject,
  role: Schema.Literals(["admin", "member"]),
  quota: Schema.FiniteFromString,
});

const registered = {
  iss: "https://issuer.example",
  aud: ["api"],
  exp: 1604416048,
  iat: 1604416018,
  nbf: 1604416028,
};

const claims = { sub: "user_1", role: "member", quota: "3" };

const policy = {
  algorithms: ["HS256"] as const,
  issuer: registered.iss,
  audience: "api",
  typ: "JWT",
  maxTokenAge: 30,
};

it.effect("encodes and decodes the caller's Schema while retaining registered claims", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(1604416038000);
    const key = yield* Jwk.importSecret(Redacted.make(secretJwk), "HS256");
    const Full = Schema.Struct({ ...Jwt.RegisteredClaims.fields, ...Claims.fields });
    const decoded = yield* Schema.decodeUnknownEffect(Full)({ ...claims, ...registered });
    const token = yield* Jwt.sign(Full, decoded, key, { alg: "HS256", typ: "JWT" });

    const independent = yield* Effect.promise(() =>
      jose.jwtVerify(Redacted.value(token), secret, { currentDate: new Date(1604416038000) }),
    );

    expect(independent.payload.quota).toBe("3");
    const verified = yield* Jwt.verify(Claims, token, key, policy);

    expect(verified.claims).toEqual({ sub: "user_1", role: "member", quota: 3 });
    expect(verified.registeredClaims.iss).toBe(registered.iss);
    expect(verified.registeredClaims.exp).toBe(registered.exp);
  }).pipe(Effect.provide(cryptoLayer)),
);

it.effect(
  "rejects correctly signed invalid application claims and preserves Schema errors without input",
  () =>
    Effect.gen(function* () {
      const key = yield* Jwk.importSecret(Redacted.make(secretJwk), "HS256");
      const token = yield* independentJwt({ ...claims, role: "private-canary-value" });

      const error = yield* Jwt.verify(Claims, token, key, { algorithms: ["HS256"] }).pipe(
        Effect.flip,
      );

      expect(error._tag).toBe("SchemaError");
      expect(JSON.stringify(error)).not.toContain("private-canary-value");
      expect(String(error)).not.toContain("private-canary-value");
      const constrained = Schema.Struct({ count: Schema.Finite.check(Schema.isGreaterThan(0)) });

      const encoding = yield* Jwt.sign(constrained, { count: -1 }, key, { alg: "HS256" }).pipe(
        Effect.flip,
      );

      expect(encoding._tag).toBe("SchemaError");
    }).pipe(Effect.provide(cryptoLayer)),
);

it.effect("validates registered claims before the application decoder", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(1604416038000);
    const key = yield* Jwk.importSecret(Redacted.make(secretJwk), "HS256");

    const token = yield* independentJwt({
      ...registered,
      ...claims,
      iss: "different",
      role: "invalid-application-role",
    });

    expect(yield* Jwt.verify(Claims, token, key, policy).pipe(Effect.flip)).toMatchObject({
      _tag: "JoseClaimValidationFailed",
      claim: "iss",
      reason: "mismatch",
    });
  }).pipe(Effect.provide(cryptoLayer)),
);

it.effect("checks the signature before parsing claims and labels unverified decoding", () =>
  Effect.gen(function* () {
    const key = yield* Jwk.importSecret(Redacted.make(secretJwk), "HS256");

    const malformed = yield* Effect.promise(() =>
      new jose.CompactSign(utf8("{")).setProtectedHeader({ alg: "HS256" }).sign(secret),
    );

    const parts = malformed.split(".");

    const wrong = Redacted.make(
      `${parts[0]}.${parts[1]}.${jose.base64url.encode(new Uint8Array(32))}`,
    );

    expect(
      (yield* Jwt.verify(Claims, wrong, key, { algorithms: ["HS256"] }).pipe(Effect.flip))._tag,
    ).toBe("JoseSignatureVerificationFailed");
    const token = yield* independentJwt(claims);
    const unverified = yield* Jwt.decodeUnverified(token);

    expect(unverified._tag).toBe("UnverifiedJwt");
    expect(Redacted.value(unverified.claims)).toEqual(claims);
  }).pipe(Effect.provide(cryptoLayer)),
);

class Decode extends Context.Service<Decode, { readonly prefix: string }>()("test/Decode") {}
class Encode extends Context.Service<Encode, { readonly prefix: string }>()("test/Encode") {}

export const ServiceClaims = Schema.Struct({
  sub: Schema.String.pipe(
    Schema.decodeTo(Schema.String, {
      decode: SchemaGetter.transformEffect((value) =>
        Effect.map(Decode, (service) => service.prefix + value),
      ),
      encode: SchemaGetter.transformEffect((value) =>
        Effect.map(Encode, (service) => value.slice(service.prefix.length)),
      ),
    }),
  ),
});

it.effect("retains distinct encoding and decoding Schema services at runtime", () =>
  Effect.gen(function* () {
    const key = yield* Jwk.importSecret(Redacted.make(secretJwk), "HS256");

    const signed = yield* Jwt.sign(ServiceClaims, { sub: "user:42" }, key, { alg: "HS256" }).pipe(
      Effect.provideService(Encode, { prefix: "user:" }),
    );

    const verified = yield* Jwt.verify(ServiceClaims, signed, key, { algorithms: ["HS256"] }).pipe(
      Effect.provideService(Decode, { prefix: "user:" }),
    );

    expect(verified.claims.sub).toBe("user:42");
  }).pipe(Effect.provide(cryptoLayer)),
);

// Compilation checks the full success/error/requirement shape, rather than casting
// an untyped decoder result. These declarations never run.
export const inference = (key: Jwk.SecretKey, token: Redacted.Redacted<string>) => {
  const value = Jwt.verify(Claims, token, key, { algorithms: ["HS256"] });

  const success: Effect.Effect<
    Jwt.Verified<typeof Claims.Type>,
    Jwt.JwtError,
    Jws.Requirements
  > = value;

  const encode = Jwt.sign(ServiceClaims, { sub: "value" }, key, { alg: "HS256" });
  const decode = Jwt.verify(ServiceClaims, token, key, { algorithms: ["HS256"] });

  const enc: Effect.Effect<
    Redacted.Redacted<string>,
    Jwt.JwtError,
    Jws.Requirements | Encode
  > = encode;

  const dec: Effect.Effect<
    Jwt.Verified<typeof ServiceClaims.Type>,
    Jwt.JwtError,
    Jws.Requirements | Decode
  > = decode;

  expectTypeOf<Effect.Services<typeof encode>>().toEqualTypeOf<Jws.Requirements | Encode>();
  expectTypeOf<Effect.Services<typeof decode>>().toEqualTypeOf<Jws.Requirements | Decode>();
  expectTypeOf<Effect.Success<typeof value>>().toEqualTypeOf<Jwt.Verified<typeof Claims.Type>>();
  expectTypeOf<Effect.Error<typeof value>>().toEqualTypeOf<Jwt.JwtError>();

  return [success, enc, dec];
};
