import { Effect, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { CryptoUnavailable, InvalidInput } from "../Errors";
import {
  type Algorithm,
  type PrivateKey,
  PrivateKeyInput,
  GenerateKeyPairInput,
  type KeyPairParameters,
  PrivateKeyParameters,
  type PublicKey,
  PublicKeyInput,
  PublicKeyParameters,
  SignInput,
  Signature,
  VerifyInput,
} from "../Signature";
import { copy, decode, importError, nativeError, withSecret } from "./common";
import { makeScopedKey } from "./scoped-key";

const derBytes = Schema.Uint8Array.check(Schema.isMinLength(1), Schema.isMaxLength(16384));

const RsaAlgorithm = Schema.Struct({
  modulusLength: Schema.Int.check(Schema.isGreaterThanOrEqualTo(2048)),
});

const component = Schema.Uint8ArrayFromBase64Url;
const GeneratedEc = Schema.Struct({ x: component, y: component, d: component });
const GeneratedEd = Schema.Struct({ x: component, d: component });

const GeneratedRsa = Schema.Struct({
  n: component,
  e: component,
  d: component,
  p: component,
  q: component,
  dp: component,
  dq: component,
  qi: component,
});

const importAlgorithm = (algorithm: Algorithm) => {
  switch (algorithm) {
    case "ECDSA-P256-SHA256":
      return { name: "ECDSA", namedCurve: "P-256" };
    case "RSA-PSS-SHA256":
      return { name: "RSA-PSS", hash: "SHA-256" };
    case "RSASSA-PKCS1-v1_5-SHA256":
      return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    case "Ed25519":
      return { name: "Ed25519" };
  }
};

const operationAlgorithm = (algorithm: Algorithm) => {
  switch (algorithm) {
    case "ECDSA-P256-SHA256":
      return { name: "ECDSA", hash: "SHA-256" };
    case "RSA-PSS-SHA256":
      return { name: "RSA-PSS", saltLength: 32 };
    case "RSASSA-PKCS1-v1_5-SHA256":
      return { name: "RSASSA-PKCS1-v1_5" };
    case "Ed25519":
      return { name: "Ed25519" };
  }
};

export const makeSignature = (subtle: SubtleCrypto): Signature["Service"] => {
  // JOSE owns JWK metadata and policy. The adapter translates validated raw
  // components through its platform key parser.
  const importComponents = Effect.fnUntraced(function* (
    parameters: PublicKeyParameters | PrivateKeyParameters,
    usage: "sign" | "verify",
  ) {
    let jwk: JsonWebKey;

    switch (parameters.algorithm) {
      case "ECDSA-P256-SHA256":
        jwk = {
          kty: "EC",
          crv: "P-256",
          x: Base64Url.encode(parameters.x),
          y: Base64Url.encode(parameters.y),
        };
        break;
      case "Ed25519":
        jwk = { kty: "OKP", crv: "Ed25519", x: Base64Url.encode(parameters.x) };
        break;
      case "RSASSA-PKCS1-v1_5-SHA256":
      case "RSA-PSS-SHA256":
        jwk = { kty: "RSA", n: Base64Url.encode(parameters.n), e: Base64Url.encode(parameters.e) };
        if ("p" in parameters) {
          jwk.p = Base64Url.encode(parameters.p);
          jwk.q = Base64Url.encode(parameters.q);
          jwk.dp = Base64Url.encode(parameters.dp);
          jwk.dq = Base64Url.encode(parameters.dq);
          jwk.qi = Base64Url.encode(parameters.qi);
        }
    }
    if ("d" in parameters) jwk.d = Base64Url.encode(parameters.d);

    const key = yield* Effect.tryPromise({
      try: () => subtle.importKey("jwk", jwk, importAlgorithm(parameters.algorithm), true, [usage]),
      catch: importError,
    });

    if (
      parameters.algorithm === "RSA-PSS-SHA256" ||
      parameters.algorithm === "RSASSA-PKCS1-v1_5-SHA256"
    ) {
      yield* Schema.decodeUnknownEffect(RsaAlgorithm)(key.algorithm).pipe(
        Effect.mapError(() => InvalidInput.make({ reason: "key" })),
      );
    }

    return key;
  });

  const importKey = Effect.fnUntraced(function* (
    algorithm: Algorithm,
    format: "pkcs8" | "spki",
    material: Uint8Array<ArrayBuffer>,
  ) {
    yield* decode(derBytes, material, "key");

    const key = yield* Effect.tryPromise({
      try: () =>
        subtle.importKey(format, material, importAlgorithm(algorithm), false, [
          format === "pkcs8" ? "sign" : "verify",
        ]),
      catch: importError,
    });

    if (algorithm === "RSA-PSS-SHA256" || algorithm === "RSASSA-PKCS1-v1_5-SHA256") {
      // The platform parsed this DER key. Validate its actual modulus, not caller metadata.
      yield* Schema.decodeUnknownEffect(RsaAlgorithm)(key.algorithm).pipe(
        Effect.mapError(() => InvalidInput.make({ reason: "key" })),
      );
    }

    return key;
  });

  const privateParametersFromJwk = Effect.fnUntraced(function* (
    algorithm: Algorithm,
    jwk: JsonWebKey,
  ) {
    const parameters: PrivateKeyParameters = yield* Effect.gen(function* () {
      switch (algorithm) {
        case "ECDSA-P256-SHA256":
          return {
            algorithm,
            ...(yield* Schema.decodeUnknownEffect(GeneratedEc)(jwk, { reportInput: false })),
          };
        case "Ed25519":
          return {
            algorithm,
            ...(yield* Schema.decodeUnknownEffect(GeneratedEd)(jwk, { reportInput: false })),
          };
        case "RSASSA-PKCS1-v1_5-SHA256":
        case "RSA-PSS-SHA256":
          return {
            algorithm,
            ...(yield* Schema.decodeUnknownEffect(GeneratedRsa)(jwk, { reportInput: false })),
          };
      }
    }).pipe(Effect.mapError(() => CryptoUnavailable.make({})));

    yield* decode(PrivateKeyParameters, parameters, "key");

    const publicKey: PublicKeyParameters =
      "n" in parameters
        ? { algorithm: parameters.algorithm, n: parameters.n.slice(), e: parameters.e.slice() }
        : "y" in parameters
          ? { algorithm: parameters.algorithm, x: parameters.x.slice(), y: parameters.y.slice() }
          : { algorithm: "Ed25519", x: parameters.x.slice() };

    return { publicKey, privateKey: Redacted.make(parameters) } satisfies KeyPairParameters;
  });

  return Signature.of({
    importPrivateKey: Effect.fnUntraced(function* (input) {
      const value = yield* decode(PrivateKeyInput, input, "key");
      const algorithm = value.algorithm;

      const use = yield* makeScopedKey(
        withSecret(value.privateKey, (material) => importKey(algorithm, "pkcs8", material)),
      );

      return {
        sign: Effect.fnUntraced(function* (input) {
          const data = yield* decode(Schema.Uint8Array, input, "data").pipe(Effect.flatMap(copy));

          const result = yield* use((key) =>
            Effect.tryPromise({
              try: () => subtle.sign(operationAlgorithm(algorithm), key, data),
              catch: nativeError,
            }),
          );

          return new Uint8Array(result);
        }),
      } satisfies PrivateKey;
    }),
    importPublicKey: Effect.fnUntraced(function* (input) {
      const value = yield* decode(PublicKeyInput, input, "key");
      const algorithm = value.algorithm;
      const material = yield* copy(value.publicKey);
      const use = yield* makeScopedKey(importKey(algorithm, "spki", material));

      return {
        verify: Effect.fnUntraced(function* (input, signature) {
          const data = yield* decode(Schema.Uint8Array, input, "data").pipe(Effect.flatMap(copy));

          const tag = yield* decode(Schema.Uint8Array, signature, "data").pipe(
            Effect.flatMap(copy),
          );

          return yield* use((key) => {
            if ((algorithm === "ECDSA-P256-SHA256" || algorithm === "Ed25519") && tag.length !== 64)
              return Effect.succeed(false);

            return Effect.tryPromise({
              try: () => subtle.verify(operationAlgorithm(algorithm), key, tag, data),
              catch: nativeError,
            });
          });
        }),
      } satisfies PublicKey;
    }),
    generateKeyPair: Effect.fnUntraced(function* (input) {
      const value = yield* decode(GenerateKeyPairInput, input, "parameters");

      const pair = yield* Effect.tryPromise({
        try: () => {
          switch (value.algorithm) {
            case "ECDSA-P256-SHA256":
              return subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
                "sign",
                "verify",
              ]);
            case "Ed25519":
              return subtle.generateKey("Ed25519", true, ["sign", "verify"]);
            case "RSASSA-PKCS1-v1_5-SHA256":
            case "RSA-PSS-SHA256":
              return subtle.generateKey(
                {
                  name: value.algorithm === "RSA-PSS-SHA256" ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
                  hash: "SHA-256",
                  modulusLength: value.modulusLength ?? 2048,
                  publicExponent: new Uint8Array([1, 0, 1]),
                },
                true,
                ["sign", "verify"],
              );
          }
        },
        catch: nativeError,
      });

      const jwk = yield* Effect.tryPromise({
        try: () => subtle.exportKey("jwk", pair.privateKey),
        catch: nativeError,
      });

      // JsonWebKey does not guarantee algorithm-specific fields. Decode only at
      // this native boundary; callers receive typed components, never loose JWKs.
      return yield* privateParametersFromJwk(value.algorithm, jwk);
    }, Effect.uninterruptible),
    encodePublicKey: Effect.fnUntraced(function* (input) {
      const parameters = yield* decode(PublicKeyParameters, input, "key");
      const key = yield* importComponents(parameters, "verify");

      const encoded = yield* Effect.tryPromise({
        try: () => subtle.exportKey("spki", key),
        catch: nativeError,
      });

      return new Uint8Array(encoded);
    }),
    encodePrivateKey: Effect.fnUntraced(function* (input) {
      const wrapped = yield* decode(
        Schema.Redacted(PrivateKeyParameters, { disallowJsonEncode: true }),
        input,
        "key",
      );

      const parameters = Redacted.value(wrapped);
      const key = yield* importComponents(parameters, "sign");

      const encoded = yield* Effect.tryPromise({
        try: () => subtle.exportKey("pkcs8", key),
        catch: nativeError,
      });

      return Redacted.make(new Uint8Array(encoded));
    }),
    decodePrivateKey: Effect.fnUntraced(function* (input) {
      const value = yield* decode(PrivateKeyInput, input, "key");
      const algorithm = value.algorithm;

      return yield* withSecret(value.privateKey, (material) =>
        Effect.gen(function* () {
          yield* decode(derBytes, material, "key");

          const key = yield* Effect.tryPromise({
            try: () =>
              subtle.importKey("pkcs8", material, importAlgorithm(algorithm), true, ["sign"]),
            catch: importError,
          });

          if (algorithm === "RSA-PSS-SHA256" || algorithm === "RSASSA-PKCS1-v1_5-SHA256") {
            yield* Schema.decodeUnknownEffect(RsaAlgorithm)(key.algorithm).pipe(
              Effect.mapError(() => InvalidInput.make({ reason: "key" })),
            );
          }

          const jwk = yield* Effect.tryPromise({
            try: () => subtle.exportKey("jwk", key),
            catch: nativeError,
          });

          return yield* privateParametersFromJwk(algorithm, jwk);
        }).pipe(Effect.uninterruptible),
      );
    }),
    sign: Effect.fnUntraced(function* (input) {
      const value = yield* decode(SignInput, input, "data");
      const data = yield* copy(value.data);

      return yield* withSecret(value.privateKey, (material) =>
        Effect.gen(function* () {
          const key = yield* importKey(value.algorithm, "pkcs8", material);

          const result = yield* Effect.tryPromise({
            try: () => subtle.sign(operationAlgorithm(value.algorithm), key, data),
            catch: nativeError,
          });

          return new Uint8Array(result);
        }).pipe(Effect.uninterruptible),
      );
    }),
    verify: Effect.fnUntraced(function* (input) {
      const value = yield* decode(VerifyInput, input, "data");
      const material = yield* copy(value.publicKey);
      const data = yield* copy(value.data);
      const signature = yield* copy(value.signature);
      const key = yield* importKey(value.algorithm, "spki", material);

      if (
        (value.algorithm === "ECDSA-P256-SHA256" || value.algorithm === "Ed25519") &&
        signature.length !== 64
      )
        return false;

      return yield* Effect.tryPromise({
        try: () => subtle.verify(operationAlgorithm(value.algorithm), key, signature, data),
        catch: nativeError,
      });
    }),
  });
};
