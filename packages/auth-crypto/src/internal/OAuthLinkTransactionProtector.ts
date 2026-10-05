import {
  OAuthLinkTransactionProtector,
  type OAuthTransactionKeyring,
  OAuthLinkTransactionContext,
  OAuthUnavailable,
  OAuthEncryptionKeyId,
  OAuthSealedTransaction,
  OAuthTransactionSecrets,
  snapshotOAuthSync,
} from "@yielded/auth/OAuth";
import { Layer, Schema } from "effect";

import { transactionEncryption } from "./transaction-encryption";

const codec = Schema.fromJsonString(
  Schema.Tuple([
    Schema.Literal("effect-auth/oauth-link-aead/v1"),
    OAuthSealedTransaction.fields.format,
    OAuthEncryptionKeyId,
    OAuthLinkTransactionContext,
  ]),
);

const encoder = new TextEncoder();

const aad = (context: OAuthLinkTransactionContext, keyId: string) => {
  const value = Schema.encodeSync(codec)([
    "effect-auth/oauth-link-aead/v1",
    "oauth-xchacha20poly1305-v1",
    keyId,
    snapshotOAuthSync(OAuthLinkTransactionContext, context),
  ]);

  if (value.length > 16384) throw OAuthUnavailable.make({});
  const bytes = encoder.encode(value);

  if (bytes.length > 16384) {
    bytes.fill(0);
    throw OAuthUnavailable.make({});
  }

  return bytes;
};

export const linkTransactionLayer = (keyring: OAuthTransactionKeyring) =>
  Layer.effect(
    OAuthLinkTransactionProtector,
    transactionEncryption(OAuthLinkTransactionContext, aad, keyring, OAuthTransactionSecrets),
  );
