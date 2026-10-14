import * as Signature from "@yielded/crypto/Signature";
import { Effect, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { InvalidKey } from "./Errors";
import { algorithms } from "./internal/algorithms";
import { decode, reveal } from "./internal/encoding";
import * as KeyInput from "./internal/keyInput";

export const AsymmetricAlgorithm = Schema.Literals(["RS256", "PS256", "ES256", "EdDSA"]);
export type AsymmetricAlgorithm = typeof AsymmetricAlgorithm.Type;
export const Algorithm = Schema.Literals(["HS256", "RS256", "PS256", "ES256", "EdDSA"]);
export type Algorithm = typeof Algorithm.Type;

const encodedBytes = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_-]+$/),
  Schema.isMaxLength(16384),
);

const operations = Schema.Array(Schema.NonEmptyString).check(
  Schema.isMaxLength(KeyInput.maxArrayLength),
  Schema.makeFilter((values) => new Set(values).size === values.length),
);

const metadata = {
  kid: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  alg: Schema.optionalKey(Schema.NonEmptyString),
  use: Schema.optionalKey(Schema.Literals(["sig", "enc"])),
  key_ops: Schema.optionalKey(operations),
  /** Optional issuer restriction published with a public key. */
  issuer: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2048))),
};

const rsa = { ...metadata, kty: Schema.Literal("RSA"), n: encodedBytes, e: encodedBytes };

const ec = {
  ...metadata,
  kty: Schema.Literal("EC"),
  crv: Schema.Literal("P-256"),
  x: encodedBytes,
  y: encodedBytes,
};

const okp = {
  ...metadata,
  kty: Schema.Literal("OKP"),
  crv: Schema.Literal("Ed25519"),
  x: encodedBytes,
};

const noSecret = { d: Schema.optionalKey(Schema.Never), k: Schema.optionalKey(Schema.Never) };

export const PublicJwk = Schema.Union([
  Schema.Struct({ ...rsa, ...noSecret }),
  Schema.Struct({ ...ec, ...noSecret }),
  Schema.Struct({ ...okp, ...noSecret }),
]);

export type PublicJwk = typeof PublicJwk.Type;

export const PrivateJwk = Schema.Union([
  Schema.Struct({
    ...rsa,
    d: encodedBytes,
    p: encodedBytes,
    q: encodedBytes,
    dp: encodedBytes,
    dq: encodedBytes,
    qi: encodedBytes,
    oth: Schema.optionalKey(Schema.Never),
  }),
  Schema.Struct({ ...ec, d: encodedBytes }),
  Schema.Struct({ ...okp, d: encodedBytes }),
]);

export type PrivateJwk = typeof PrivateJwk.Type;

export const SecretJwk = Schema.Struct({
  ...metadata,
  kty: Schema.Literal("oct"),
  k: encodedBytes,
});

export type SecretJwk = typeof SecretJwk.Type;

export const GenerateKeyPairInput = Schema.Union([
  Schema.Struct({
    algorithm: Schema.Literals(["RS256", "PS256"]),
    modulusLength: Schema.optionalKey(Signature.RsaModulusLength),
    kid: metadata.kid,
  }),
  Schema.Struct({ algorithm: Schema.Literals(["ES256", "EdDSA"]), kid: metadata.kid }),
]);

export type GenerateKeyPairInput = typeof GenerateKeyPairInput.Type;

export const GeneratedKeyPair = Schema.Struct({
  publicKey: PublicJwk,
  privateKey: Schema.Redacted(PrivateJwk, { disallowJsonEncode: true }),
});

export type GeneratedKeyPair = typeof GeneratedKeyPair.Type;

/** Validated, algorithm-bound key snapshots. Private material remains Redacted. */
export interface PublicKey {
  readonly _tag: "PublicKey";
  readonly algorithm: AsymmetricAlgorithm;
  readonly jwk: PublicJwk;
  readonly material: Uint8Array;
}

export interface PrivateKey {
  readonly _tag: "PrivateKey";
  readonly algorithm: AsymmetricAlgorithm;
  readonly jwk: Redacted.Redacted<PrivateJwk>;
  readonly material: Redacted.Redacted<Uint8Array>;
}

export interface SecretKey {
  readonly _tag: "SecretKey";
  readonly algorithm: "HS256" | "dir";
  readonly jwk: Redacted.Redacted<SecretJwk>;
  readonly material: Redacted.Redacted<Uint8Array>;
}

export type SigningKey = PrivateKey | SecretKey;
export type VerificationKey = PublicKey | SecretKey;

/** Generate typed signing JWKs through the selected crypto backend. */
export const generateKeyPair = Effect.fnUntraced(function* (input: GenerateKeyPairInput) {
  const value = yield* Schema.decodeEffect(GenerateKeyPairInput)(input).pipe(
    Effect.mapError(() => InvalidKey.make({})),
  );

  const signatures = yield* Signature.Signature;

  return yield* Effect.acquireUseRelease(
    signatures.generateKeyPair({
      algorithm: algorithms[value.algorithm],
      ...("modulusLength" in value ? { modulusLength: value.modulusLength } : {}),
    }),
    (pair) =>
      Effect.sync((): GeneratedKeyPair => {
        const parameters = Redacted.value(pair.privateKey);

        const meta = {
          alg: value.algorithm,
          use: "sig" as const,
          ...(value.kid === undefined ? {} : { kid: value.kid }),
        };

        switch (parameters.algorithm) {
          case "RSASSA-PKCS1-v1_5-SHA256":
          case "RSA-PSS-SHA256": {
            const publicKey = {
              ...meta,
              kty: "RSA" as const,
              n: Base64Url.encode(parameters.n),
              e: Base64Url.encode(parameters.e),
            };

            return {
              publicKey,
              privateKey: Redacted.make({
                ...publicKey,
                d: Base64Url.encode(parameters.d),
                p: Base64Url.encode(parameters.p),
                q: Base64Url.encode(parameters.q),
                dp: Base64Url.encode(parameters.dp),
                dq: Base64Url.encode(parameters.dq),
                qi: Base64Url.encode(parameters.qi),
              }),
            };
          }
          case "ECDSA-P256-SHA256": {
            const publicKey = {
              ...meta,
              kty: "EC" as const,
              crv: "P-256" as const,
              x: Base64Url.encode(parameters.x),
              y: Base64Url.encode(parameters.y),
            };

            return {
              publicKey,
              privateKey: Redacted.make({ ...publicKey, d: Base64Url.encode(parameters.d) }),
            };
          }
          case "Ed25519": {
            const publicKey = {
              ...meta,
              kty: "OKP" as const,
              crv: "Ed25519" as const,
              x: Base64Url.encode(parameters.x),
            };

            return {
              publicKey,
              privateKey: Redacted.make({ ...publicKey, d: Base64Url.encode(parameters.d) }),
            };
          }
        }
      }),
    (pair) =>
      Effect.sync(() => {
        for (const part of Object.values(Redacted.value(pair.privateKey))) {
          if (typeof part !== "string") part.fill(0);
        }
      }),
  );
});

const read = <S extends Schema.Constraint>(schema: S, input: unknown) =>
  Effect.try({
    try: () => KeyInput.jwk(input),
    catch: () => InvalidKey.make({}),
  }).pipe(
    Effect.flatMap(Effect.fromResult),
    Effect.flatMap((captured) =>
      Schema.decodeUnknownEffect(schema)(captured, { reportInput: false }).pipe(
        Effect.mapError(() => InvalidKey.make({})),
      ),
    ),
    Effect.map(KeyInput.detach),
  );

const bytes = (value: string) => decode(value).pipe(Effect.mapError(() => InvalidKey.make({})));

const snapshot = <A extends PublicJwk | PrivateJwk | SecretJwk>(jwk: A): A => {
  if (jwk.key_ops !== undefined) Object.freeze(jwk.key_ops);

  return Object.freeze(jwk);
};

const publicParameters = Effect.fnUntraced(function* (
  jwk: PublicJwk | PrivateJwk,
  algorithm: AsymmetricAlgorithm,
): Effect.fn.Return<Signature.PublicKeyParameters, InvalidKey> {
  if (jwk.alg !== undefined && jwk.alg !== algorithm) return yield* InvalidKey.make({});
  switch (jwk.kty) {
    case "EC":
      if (algorithm !== "ES256") return yield* InvalidKey.make({});

      return { algorithm: "ECDSA-P256-SHA256", x: yield* bytes(jwk.x), y: yield* bytes(jwk.y) };
    case "OKP":
      if (algorithm !== "EdDSA") return yield* InvalidKey.make({});

      return { algorithm: "Ed25519", x: yield* bytes(jwk.x) };
    case "RSA":
      if (algorithm !== "RS256" && algorithm !== "PS256") return yield* InvalidKey.make({});

      return { algorithm: algorithms[algorithm], n: yield* bytes(jwk.n), e: yield* bytes(jwk.e) };
  }
});

export const importPublic = Effect.fnUntraced(function* (
  input: unknown,
  selected: AsymmetricAlgorithm,
) {
  const algorithm = yield* read(AsymmetricAlgorithm, selected);
  const jwk = yield* read(PublicJwk, input);
  const parameters = yield* publicParameters(jwk, algorithm);
  const signatures = yield* Signature.Signature;

  const material = yield* signatures
    .encodePublicKey(parameters)
    .pipe(Effect.catchTag("CryptoInvalidInput", () => InvalidKey.make({})));

  return Object.freeze({
    _tag: "PublicKey",
    algorithm,
    jwk: snapshot(jwk),
    material,
  }) satisfies PublicKey;
});

export const importPrivate = Effect.fnUntraced(function* (
  input: Redacted.Redacted<unknown>,
  selected: AsymmetricAlgorithm,
) {
  const algorithm = yield* read(AsymmetricAlgorithm, selected);

  const jwk = yield* read(
    PrivateJwk,
    yield* reveal(input).pipe(Effect.mapError(() => InvalidKey.make({}))),
  );

  const publicPart = yield* publicParameters(jwk, algorithm);
  const d = yield* bytes(jwk.d);

  const parameters = yield* read(Signature.PrivateKeyParameters, {
    ...publicPart,
    d,
    ...(jwk.kty === "RSA"
      ? {
          p: yield* bytes(jwk.p),
          q: yield* bytes(jwk.q),
          dp: yield* bytes(jwk.dp),
          dq: yield* bytes(jwk.dq),
          qi: yield* bytes(jwk.qi),
        }
      : {}),
  });

  const signatures = yield* Signature.Signature;

  const material = yield* signatures.encodePrivateKey(Redacted.make(parameters)).pipe(
    Effect.catchTag("CryptoInvalidInput", () => InvalidKey.make({})),
    Effect.ensuring(
      Effect.sync(() => {
        parameters.d.fill(0);
        if ("p" in parameters)
          for (const part of [
            parameters.p,
            parameters.q,
            parameters.dp,
            parameters.dq,
            parameters.qi,
          ])
            part.fill(0);
      }),
    ),
  );

  return Object.freeze({
    _tag: "PrivateKey",
    algorithm,
    jwk: Redacted.make(snapshot(jwk)),
    material,
  }) satisfies PrivateKey;
});

/** Import PKCS8 DER through the crypto backend, then bind the resulting JWK. */
export const importPkcs8 = Effect.fnUntraced(function* (
  input: Redacted.Redacted<Uint8Array>,
  selected: AsymmetricAlgorithm,
  options?: { readonly kid?: string },
) {
  const algorithm = yield* read(AsymmetricAlgorithm, selected);
  const signatures = yield* Signature.Signature;

  const pair = yield* signatures
    .decodePrivateKey({ algorithm: algorithms[algorithm], privateKey: input })
    .pipe(Effect.mapError(() => InvalidKey.make({})));

  const parameters = Redacted.value(pair.privateKey);

  const meta = {
    alg: algorithm,
    use: "sig" as const,
    ...(options?.kid === undefined ? {} : { kid: options.kid }),
  };

  const jwk: PrivateJwk =
    parameters.algorithm === "ECDSA-P256-SHA256"
      ? {
          ...meta,
          kty: "EC",
          crv: "P-256",
          x: Base64Url.encode(parameters.x),
          y: Base64Url.encode(parameters.y),
          d: Base64Url.encode(parameters.d),
        }
      : parameters.algorithm === "Ed25519"
        ? {
            ...meta,
            kty: "OKP",
            crv: "Ed25519",
            x: Base64Url.encode(parameters.x),
            d: Base64Url.encode(parameters.d),
          }
        : {
            ...meta,
            kty: "RSA",
            n: Base64Url.encode(parameters.n),
            e: Base64Url.encode(parameters.e),
            d: Base64Url.encode(parameters.d),
            p: Base64Url.encode(parameters.p),
            q: Base64Url.encode(parameters.q),
            dp: Base64Url.encode(parameters.dp),
            dq: Base64Url.encode(parameters.dq),
            qi: Base64Url.encode(parameters.qi),
          };

  return yield* importPrivate(Redacted.make(jwk), algorithm).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        parameters.d.fill(0);
        if ("p" in parameters)
          for (const part of [
            parameters.p,
            parameters.q,
            parameters.dp,
            parameters.dq,
            parameters.qi,
          ])
            part.fill(0);
      }),
    ),
  );
});

export const importSecret = Effect.fnUntraced(function* (
  input: Redacted.Redacted<unknown>,
  selected: "HS256" | "dir",
) {
  const algorithm = yield* read(Schema.Literals(["HS256", "dir"]), selected);

  const jwk = yield* read(
    SecretJwk,
    yield* reveal(input).pipe(Effect.mapError(() => InvalidKey.make({}))),
  );

  const material = yield* bytes(jwk.k);

  if (
    (jwk.alg !== undefined && jwk.alg !== algorithm) ||
    material.length < 32 ||
    (algorithm === "dir" && material.length !== 32)
  ) {
    material.fill(0);

    return yield* InvalidKey.make({});
  }

  return Object.freeze({
    _tag: "SecretKey",
    algorithm,
    jwk: Redacted.make(snapshot(jwk)),
    material: Redacted.make(material),
  }) satisfies SecretKey;
});

export const exportPublic = Effect.fnUntraced(function* (key: PublicKey) {
  return yield* read(PublicJwk, key.jwk);
});

export const exportPrivate = Effect.fnUntraced(function* (key: PrivateKey | SecretKey) {
  const value = yield* reveal<PrivateJwk | SecretJwk>(key.jwk).pipe(
    Effect.mapError(() => InvalidKey.make({})),
  );

  return Redacted.make(yield* read(Schema.Union([PrivateJwk, SecretJwk]), value));
});
