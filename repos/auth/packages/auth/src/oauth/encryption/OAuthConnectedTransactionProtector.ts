import { Effect, Schema } from "effect";

import { OAuthConnectedTransactionContext } from "../connectedModels";
import { OAuthUnavailable } from "../signInErrors";
import { OAuthTransactionSecrets, OAuthSealedTransaction } from "../signInModels";
import { type OAuthTransactionKeyring } from "../transactionKeyring";
import { encodeUtf8 } from "./payload";
import { transactionEncryption } from "./transaction-encryption";

const codec = Schema.fromJsonString(
  Schema.Tuple([
    Schema.Literal("effect-auth/oauth-connected-aead/v1"),
    OAuthSealedTransaction.fields.format,
    OAuthSealedTransaction.fields.keyId,
    OAuthConnectedTransactionContext,
  ]),
);

const aad = Effect.fnUntraced(function* (context: OAuthConnectedTransactionContext, keyId: string) {
  const value = yield* Schema.encodeEffect(codec)([
    "effect-auth/oauth-connected-aead/v1",
    "oauth-xchacha20poly1305-v1",
    keyId,
    context,
  ]).pipe(Effect.mapError(() => OAuthUnavailable.make({})));

  return yield* encodeUtf8(value, 262144);
});

export const make = (keyring: OAuthTransactionKeyring) =>
  transactionEncryption(OAuthConnectedTransactionContext, aad, keyring, OAuthTransactionSecrets, {
    schema: OAuthSealedTransaction,
    maximumPlaintextBytes: 16384,
  });
