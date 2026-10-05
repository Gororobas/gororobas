// oxlint-disable-next-line import/extensions -- Noble exposes only its explicit .js subpath.
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import {
  OAuthConnectedTokenProtector,
  OAuthConnectedProtectionContext,
  OAuthConnectedSealedTokens,
  OAuthConnectedTokenMaterial,
  OAuthConfigurationError,
  OAuthUnavailable,
  OAuthEncryptionKeyId,
  snapshotOAuthSync,
  type OAuthConnectedTokenKeyring,
} from "@yielded/auth/OAuth";
import { Crypto, Effect, Layer, Redacted, Result, Schema } from "effect";
import { Base64Url } from "effect/encoding";

const keyringSchema = Schema.Struct({
  activeKeyId: OAuthEncryptionKeyId,
  keys: Schema.Array(
    Schema.Struct({
      id: OAuthEncryptionKeyId,
      material: Schema.Redacted(Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/))),
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(8)),
});

const materialCodec = Schema.fromJsonString(OAuthConnectedTokenMaterial);

const contextCodec = Schema.fromJsonString(
  Schema.Tuple([
    Schema.Literal("effect-auth/oauth-connected-token-aead/v1"),
    OAuthConnectedSealedTokens.fields.format,
    OAuthEncryptionKeyId,
    OAuthConnectedProtectionContext,
  ]),
);

const encoder = new TextEncoder();

const decode = (value: string, maximum: number, exact?: number) => {
  if (
    value.length > Math.ceil((maximum * 4) / 3) ||
    value.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  )
    throw OAuthUnavailable.make({});
  const bytes = Result.getOrUndefined(Base64Url.decode(value));

  if (
    !bytes ||
    bytes.length > maximum ||
    (exact !== undefined && bytes.length !== exact) ||
    Base64Url.encode(bytes) !== value
  ) {
    bytes?.fill(0);
    throw OAuthUnavailable.make({});
  }

  return bytes;
};

const validate = (context: OAuthConnectedProtectionContext, input: OAuthConnectedTokenMaterial) => {
  const material = snapshotOAuthSync(OAuthConnectedTokenMaterial, input);

  const token =
    context.namespace === "effect-auth/oauth-connected-token-context/v1" ? context : context.token;

  if (
    (token.configuration.protocol === "oidc") !== (material.continuation._tag === "Oidc") ||
    (token.configuration.profile.retention === "access-only" && material.refreshToken !== undefined)
  )
    throw OAuthUnavailable.make({});

  return material;
};

const aad = (context: OAuthConnectedProtectionContext, keyId: string) => {
  const json = Schema.encodeSync(contextCodec)([
    "effect-auth/oauth-connected-token-aead/v1",
    "oauth-connected-xchacha20poly1305-v1",
    keyId,
    context,
  ]);

  if (json.length > 262144) throw OAuthUnavailable.make({});
  const bytes = encoder.encode(json);

  if (bytes.length > 262144) {
    bytes.fill(0);
    throw OAuthUnavailable.make({});
  }

  return bytes;
};

const make = (keyring: OAuthConnectedTokenKeyring) => {
  let captured: typeof keyringSchema.Type | undefined;

  try {
    captured = snapshotOAuthSync(keyringSchema, keyring);
  } catch {
    /* Layer validates. */
  }

  return Effect.gen(function* () {
    if (!captured) return yield* OAuthConfigurationError.make({ reason: "keyring" });
    const configuration = captured;
    const { randomBytes } = yield* Crypto.Crypto;

    const keys = yield* Effect.try({
      try: () => {
        const map = new Map<string, Uint8Array>();

        try {
          for (const key of configuration.keys) {
            if (map.has(key.id)) throw OAuthUnavailable.make({});
            map.set(key.id, decode(Redacted.value(key.material), 32, 32));
          }
          if (!map.has(configuration.activeKeyId)) throw OAuthUnavailable.make({});

          return map;
        } catch (error) {
          for (const key of map.values()) key.fill(0);
          throw error;
        }
      },
      catch: () => OAuthConfigurationError.make({ reason: "keyring" }),
    });

    return {
      seal: Effect.fn("OAuthConnectedTokenProtector.seal")(function* (input: {
        readonly context: OAuthConnectedProtectionContext;
        readonly material: OAuthConnectedTokenMaterial;
      }) {
        const retained = yield* Effect.try({
          try: () => {
            const context = snapshotOAuthSync(OAuthConnectedProtectionContext, input.context);

            return { context, material: validate(context, input.material) };
          },
          catch: () => OAuthUnavailable.make({}),
        });

        const nonce = yield* randomBytes(24).pipe(Effect.mapError(() => OAuthUnavailable.make({})));

        return yield* Effect.try({
          try: () => {
            let plaintext: Uint8Array | undefined,
              ciphertext: Uint8Array | undefined,
              associated: Uint8Array | undefined;

            try {
              plaintext = encoder.encode(Schema.encodeSync(materialCodec)(retained.material));
              associated = aad(retained.context, configuration.activeKeyId);
              if (plaintext.length > 98304 || nonce.length !== 24) throw OAuthUnavailable.make({});
              ciphertext = xchacha20poly1305(
                keys.get(configuration.activeKeyId)!,
                nonce,
                associated,
              ).encrypt(plaintext);

              return snapshotOAuthSync(OAuthConnectedSealedTokens, {
                format: "oauth-connected-xchacha20poly1305-v1",
                keyId: configuration.activeKeyId,
                nonce: Base64Url.encode(nonce),
                ciphertext: Redacted.make(Base64Url.encode(ciphertext)),
              });
            } finally {
              plaintext?.fill(0);
              ciphertext?.fill(0);
              associated?.fill(0);
              nonce.fill(0);
            }
          },
          catch: () => OAuthUnavailable.make({}),
        });
      }),
      open: Effect.fn("OAuthConnectedTokenProtector.open")(
        (input: {
          readonly context: OAuthConnectedProtectionContext;
          readonly sealed: OAuthConnectedSealedTokens;
        }) =>
          Effect.try({
            try: () => {
              const context = snapshotOAuthSync(OAuthConnectedProtectionContext, input.context);
              const sealed = snapshotOAuthSync(OAuthConnectedSealedTokens, input.sealed);
              const key = keys.get(sealed.keyId);

              if (!key) throw OAuthUnavailable.make({});

              let nonce: Uint8Array | undefined,
                ciphertext: Uint8Array | undefined,
                plaintext: Uint8Array | undefined,
                associated: Uint8Array | undefined;

              try {
                nonce = decode(sealed.nonce, 24, 24);
                ciphertext = decode(Redacted.value(sealed.ciphertext), 98320);
                associated = aad(context, sealed.keyId);
                plaintext = xchacha20poly1305(key, nonce, associated).decrypt(ciphertext);
                if (plaintext.length > 98304) throw OAuthUnavailable.make({});
                const json = new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
                const material = Schema.decodeSync(materialCodec)(json);

                if (Schema.encodeSync(materialCodec)(material) !== json)
                  throw OAuthUnavailable.make({});

                return validate(context, material);
              } finally {
                nonce?.fill(0);
                ciphertext?.fill(0);
                plaintext?.fill(0);
                associated?.fill(0);
              }
            },
            catch: () => OAuthUnavailable.make({}),
          }),
      ),
    };
  });
};

export const connectedTokenLayer = (keyring: OAuthConnectedTokenKeyring) =>
  Layer.effect(OAuthConnectedTokenProtector, make(keyring));
