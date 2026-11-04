import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { OAuthConnectedTransactionContext } from "./connectedModels";
import { make } from "./encryption/OAuthConnectedTransactionProtector";
import type { OAuthUnavailable } from "./signInErrors";
import type { OAuthTransactionSecrets, OAuthSealedTransaction } from "./signInModels";
import type { OAuthTransactionKeyring } from "./transactionKeyring";

/** Separate connected purpose. Key retention includes live flow deadlines.
 * Layer teardown cancels and joins active operations before wiping keys;
 * later calls fail with OAuthUnavailable. */
export class OAuthConnectedTransactionProtector extends Context.Service<
  OAuthConnectedTransactionProtector,
  {
    readonly seal: (input: {
      readonly context: OAuthConnectedTransactionContext;
      readonly secrets: OAuthTransactionSecrets;
    }) => Effect.Effect<OAuthSealedTransaction, OAuthUnavailable>;
    readonly open: (input: {
      readonly context: OAuthConnectedTransactionContext;
      readonly sealed: OAuthSealedTransaction;
    }) => Effect.Effect<OAuthTransactionSecrets, OAuthUnavailable>;
  }
>()("effect-auth/OAuthConnectedTransactionProtector") {
  static readonly layer = (keyring: OAuthTransactionKeyring) => Layer.effect(this, make(keyring));
}
