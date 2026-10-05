import { Crypto, Effect, Redacted, Result, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { TokenDigest } from "../Schema";
import { SubtleCrypto } from "../WebCrypto";
import { SessionConfigurationError, SessionInvalid, SessionUnavailable } from "./errors";

export interface SessionSigningKeyring {
  readonly activeKeyId: string;
  /** At least 32 cryptographically random bytes per key, encoded as base64url. */
  readonly keys: ReadonlyArray<{
    readonly id: string;
    readonly material: Redacted.Redacted<string>;
  }>;
}

const opaqueCredential = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/));
const keyIdSchema = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,64}$/));

const Keyring = Schema.Struct({
  activeKeyId: keyIdSchema,
  keys: Schema.Array(
    Schema.Struct({ id: keyIdSchema, material: Schema.Redacted(Schema.String) }),
  ).check(Schema.isMinLength(1)),
});

const tokenFormat = Schema.String.check(
  Schema.isPattern(/^eas1\.[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
);

const textEncoder = new TextEncoder();

const digestMessage = Schema.fromJsonString(
  Schema.Struct({
    namespace: Schema.Literal("effect-auth/session"),
    moduleId: Schema.String,
    purpose: Schema.Literals(["bearer", "pending", "step-up", "step-up-binding"]),
    secret: Schema.String,
  }),
);

export const makeSessionSecrets = Effect.fn("makeSessionSecrets")(function* (moduleId: string) {
  const crypto = yield* Crypto.Crypto;

  return {
    generate: Effect.fn("SessionSecrets.generate")(function* () {
      const bytes = yield* crypto
        .randomBytes(32)
        .pipe(Effect.mapError(() => SessionUnavailable.make({})));

      return Redacted.make(Base64Url.encode(bytes));
    }),
    digest: Effect.fn("SessionSecrets.digest")(function* (
      token: Redacted.Redacted<string>,
      purpose: "bearer" | "pending" | "step-up" | "step-up-binding",
    ) {
      yield* Schema.decodeEffect(opaqueCredential)(Redacted.value(token)).pipe(
        Effect.mapError(() => SessionInvalid.make({})),
      );

      const message = yield* Schema.encodeEffect(digestMessage)({
        namespace: "effect-auth/session",
        moduleId,
        purpose,
        secret: Redacted.value(token),
      }).pipe(Effect.orDie);

      const digest = yield* crypto
        .digest("SHA-256", textEncoder.encode(message))
        .pipe(Effect.mapError(() => SessionUnavailable.make({})));

      return TokenDigest.make(Base64Url.encode(digest));
    }),
  };
});

/** Immutable key snapshot: retirement is effective only after every runtime installs it. */
export const makeSessionSigningCodec = Effect.fn("makeSessionSigningCodec")(function* <
  S extends Schema.Top,
>(schema: S, configuration: SessionSigningKeyring, maximumTokenBytes: number) {
  const checked = yield* Schema.decodeEffect(Keyring)(configuration).pipe(
    Effect.mapError(() => SessionConfigurationError.make({ reason: "keyring" })),
  );

  const subtle = yield* SubtleCrypto;
  const services = yield* Effect.context<S["DecodingServices"] | S["EncodingServices"]>();
  const keys = new Map<string, CryptoKey>();

  for (const entry of checked.keys) {
    yield* Schema.decodeEffect(keyIdSchema)(entry.id).pipe(
      Effect.mapError(() => SessionConfigurationError.make({ reason: "keyring" })),
    );

    const material = Result.getOrUndefined(Base64Url.decode(Redacted.value(entry.material)));

    if (keys.has(entry.id) || material === undefined || material.length < 32) {
      return yield* SessionConfigurationError.make({ reason: "keyring" });
    }

    const key = yield* Effect.tryPromise({
      try: () =>
        subtle.importKey(
          "raw",
          material as BufferSource,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign", "verify"],
        ),
      catch: () => SessionConfigurationError.make({ reason: "keyring" }),
    });

    keys.set(entry.id, key);
  }
  const activeKeyId = checked.activeKeyId;
  const activeKey = keys.get(activeKeyId);

  if (activeKey === undefined) return yield* SessionConfigurationError.make({ reason: "keyring" });
  const codec = Schema.fromJsonString(Schema.toCodecJson(schema));
  const encode = Schema.encodeEffect(codec);
  const decode = Schema.decodeEffect(codec);

  return {
    encode: Effect.fn("SessionSigningCodec.encode")(function* (claims: S["Type"]) {
      const json = yield* encode(claims).pipe(
        Effect.provide(services),
        Effect.mapError(() => SessionUnavailable.make({})),
      );

      const message = `eas1.${activeKeyId}.${Base64Url.encode(json)}`;

      const signature = yield* Effect.tryPromise({
        try: () => subtle.sign("HMAC", activeKey, textEncoder.encode(message)),
        catch: () => SessionUnavailable.make({}),
      });

      const token = `${message}.${Base64Url.encode(new Uint8Array(signature))}`;

      if (token.length > maximumTokenBytes) return yield* SessionUnavailable.make({});

      return Redacted.make(token);
    }),
    decode: Effect.fn("SessionSigningCodec.decode")(function* (
      credential: Redacted.Redacted<string>,
    ) {
      const token = Redacted.value(credential);

      if (token.length > maximumTokenBytes) return yield* SessionInvalid.make({});
      yield* Schema.decodeEffect(tokenFormat)(token).pipe(
        Effect.mapError(() => SessionInvalid.make({})),
      );
      const [version, keyId, payload, signatureText] = token.split(".");
      const key = keys.get(keyId);
      const signature = Result.getOrUndefined(Base64Url.decode(signatureText));

      if (key === undefined || signature === undefined || signature.length !== 32)
        return yield* SessionInvalid.make({});

      const valid = yield* Effect.tryPromise({
        try: () =>
          subtle.verify(
            "HMAC",
            key,
            signature as BufferSource,
            textEncoder.encode(`${version}.${keyId}.${payload}`),
          ),
        catch: () => SessionUnavailable.make({}),
      });

      if (!valid) return yield* SessionInvalid.make({});
      const json = Result.getOrUndefined(Base64Url.decodeString(payload));

      if (json === undefined) return yield* SessionInvalid.make({});

      return yield* decode(json).pipe(
        Effect.provide(services),
        Effect.mapError(() => SessionInvalid.make({})),
      );
    }),
  };
});
