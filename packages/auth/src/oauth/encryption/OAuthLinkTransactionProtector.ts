import { Effect, Schema } from "effect";

import { OAuthLinkTransactionContext } from "../accountsModels";
import { OAuthUnavailable } from "../signInErrors";
import {
  OAuthEncryptionKeyId,
  OAuthSealedTransaction,
  OAuthTransactionSecrets,
} from "../signInModels";
import { type OAuthTransactionKeyring } from "../transactionKeyring";
import { encodeUtf8 } from "./payload";
import { transactionEncryption } from "./transaction-encryption";

const codec = Schema.fromJsonString(
  Schema.Tuple([
    Schema.Literal("effect-auth/oauth-link-aead/v1"),
    OAuthSealedTransaction.fields.format,
    OAuthEncryptionKeyId,
    OAuthLinkTransactionContext,
  ]),
);

const aad = Effect.fnUntraced(function* (context: OAuthLinkTransactionContext, keyId: string) {
  const value = yield* Schema.encodeEffect(codec)([
    "effect-auth/oauth-link-aead/v1",
    "oauth-xchacha20poly1305-v1",
    keyId,
    context,
  ]).pipe(Effect.mapError(() => OAuthUnavailable.make({})));

  return yield* encodeUtf8(value, 262144);
});

export const make = (keyring: OAuthTransactionKeyring) =>
  transactionEncryption(OAuthLinkTransactionContext, aad, keyring, OAuthTransactionSecrets);
