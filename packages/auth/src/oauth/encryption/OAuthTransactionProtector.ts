import { Effect, Schema } from "effect";

import { OAuthUnavailable } from "../signInErrors";
import {
  OAuthEncryptionKeyId,
  OAuthSealedTransaction,
  OAuthTransactionSecrets,
  OAuthSignInTransactionContext,
} from "../signInModels";
import { type OAuthTransactionKeyring } from "../transactionKeyring";
import { encodeUtf8 } from "./payload";
import { transactionEncryption } from "./transaction-encryption";

const aadCodec = Schema.fromJsonString(
  Schema.Tuple([
    Schema.Literal("effect-auth/oauth-sign-in-aead/v1"),
    OAuthSealedTransaction.fields.format,
    OAuthEncryptionKeyId,
    OAuthSignInTransactionContext,
  ]),
);

const aad = Effect.fnUntraced(function* (context: OAuthSignInTransactionContext, keyId: string) {
  const encoded = yield* Schema.encodeEffect(aadCodec)([
    "effect-auth/oauth-sign-in-aead/v1",
    "oauth-xchacha20poly1305-v1",
    keyId,
    context,
  ]).pipe(Effect.mapError(() => OAuthUnavailable.make({})));

  return yield* encodeUtf8(encoded, 262144);
});

export const make = (keyring: OAuthTransactionKeyring) =>
  transactionEncryption(OAuthSignInTransactionContext, aad, keyring, OAuthTransactionSecrets);
