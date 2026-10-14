import { Effect, Schema } from "effect";

import {
  OAuthConnectedTokenContext,
  OAuthConnectedSealedTokens,
  OAuthConnectedTokenMaterial,
} from "../connectedModels";
import type { OAuthConnectedTokenKeyring } from "../OAuthConnectedTokenProtector";
import { OAuthUnavailable } from "../signInErrors";
import { OAuthEncryptionKeyId } from "../signInModels";
import { encodeUtf8, payloadEncryption } from "./payload";

const contextCodec = Schema.fromJsonString(
  Schema.Tuple([
    Schema.Literal("effect-auth/oauth-connected-token-aead/v1"),
    OAuthConnectedSealedTokens.fields.format,
    OAuthEncryptionKeyId,
    OAuthConnectedTokenContext,
  ]),
);

const validate = Effect.fnUntraced(function* (
  context: OAuthConnectedTokenContext,
  material: OAuthConnectedTokenMaterial,
) {
  const token = context;

  if (
    (token.configuration.protocol === "oidc") !== (material.continuation._tag === "Oidc") ||
    (token.configuration.profile.retention === "access-only" && material.refreshToken !== undefined)
  )
    return yield* OAuthUnavailable.make({});

  return material;
});

const aad = Effect.fnUntraced(function* (context: OAuthConnectedTokenContext, keyId: string) {
  const json = yield* Schema.encodeEffect(contextCodec)([
    "effect-auth/oauth-connected-token-aead/v1",
    "oauth-connected-xchacha20poly1305-v1",
    keyId,
    context,
  ]).pipe(Effect.mapError(() => OAuthUnavailable.make({})));

  return yield* encodeUtf8(json, 262144);
});

export const make = (keyring: OAuthConnectedTokenKeyring) =>
  payloadEncryption(
    {
      context: OAuthConnectedTokenContext,
      plaintext: OAuthConnectedTokenMaterial,
      envelope: OAuthConnectedSealedTokens,
      format: "oauth-connected-xchacha20poly1305-v1",
      maximumPlaintextBytes: 98304,
      aad,
      validate,
    },
    keyring,
  ).pipe(
    Effect.map((encryption) => ({
      seal: (input: {
        readonly context: OAuthConnectedTokenContext;
        readonly material: OAuthConnectedTokenMaterial;
      }) => encryption.seal(input.context, input.material),
      open: (input: {
        readonly context: OAuthConnectedTokenContext;
        readonly sealed: OAuthConnectedSealedTokens;
      }) => encryption.open(input.context, input.sealed),
    })),
  );
