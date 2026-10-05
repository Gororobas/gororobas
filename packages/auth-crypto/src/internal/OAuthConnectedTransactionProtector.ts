import {
  OAuthConnectedTransactionProtector,
  type OAuthTransactionKeyring,
  OAuthConnectedTransactionContext,
  OAuthConnectedTransactionSecrets,
  OAuthUnavailable,
  OAuthConnectedSealedTransaction,
  snapshotOAuthSync,
} from "@yielded/auth/OAuth";
import { Layer, Schema } from "effect";

import { transactionEncryption } from "./transaction-encryption";

const codec = Schema.fromJsonString(
  Schema.Tuple([
    Schema.Literal("effect-auth/oauth-connected-aead/v1"),
    OAuthConnectedSealedTransaction.fields.format,
    OAuthConnectedSealedTransaction.fields.keyId,
    OAuthConnectedTransactionContext,
  ]),
);

const encoder = new TextEncoder();

const aad = (context: OAuthConnectedTransactionContext, keyId: string) => {
  const value = Schema.encodeSync(codec)([
    "effect-auth/oauth-connected-aead/v1",
    "oauth-xchacha20poly1305-v1",
    keyId,
    snapshotOAuthSync(OAuthConnectedTransactionContext, context),
  ]);

  if (value.length > 262144) throw OAuthUnavailable.make({});
  const bytes = encoder.encode(value);

  if (bytes.length > 262144) {
    bytes.fill(0);
    throw OAuthUnavailable.make({});
  }

  return bytes;
};

export const connectedTransactionLayer = (keyring: OAuthTransactionKeyring) =>
  Layer.effect(
    OAuthConnectedTransactionProtector,
    transactionEncryption(
      OAuthConnectedTransactionContext,
      aad,
      keyring,
      OAuthConnectedTransactionSecrets,
      { schema: OAuthConnectedSealedTransaction, maximumPlaintextBytes: 100 * 1024 },
    ),
  );
