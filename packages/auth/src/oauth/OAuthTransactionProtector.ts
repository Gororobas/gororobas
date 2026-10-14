import { Context, type Effect, Layer } from "effect";

import { make } from "./encryption/OAuthTransactionProtector";
import type { OAuthUnavailable } from "./signInErrors";
import type {
  OAuthTransactionSecrets,
  OAuthSealedTransaction,
  OAuthSignInTransactionContext,
} from "./signInModels";
import type { OAuthTransactionKeyring } from "./transactionKeyring";

/** Dedicated transaction encryption. Layer teardown cancels and joins active
 * operations before wiping keys; calls after teardown fail with OAuthUnavailable.
 * Retain retired keys through every pending and claimed flow horizon and
 * deployment convergence; binder signing keys have
 * an independent retention obligation. Never reuse session or connected-token keys.
 * Redacted prevents formatting, not memory disclosure or JavaScript zeroization.
 */
export class OAuthTransactionProtector extends Context.Service<
  OAuthTransactionProtector,
  {
    readonly seal: (input: {
      readonly context: OAuthSignInTransactionContext;
      readonly secrets: OAuthTransactionSecrets;
    }) => Effect.Effect<OAuthSealedTransaction, OAuthUnavailable>;
    readonly open: (input: {
      readonly context: OAuthSignInTransactionContext;
      readonly sealed: OAuthSealedTransaction;
    }) => Effect.Effect<OAuthTransactionSecrets, OAuthUnavailable>;
  }
>()("effect-auth/OAuthTransactionProtector") {
  static readonly layer = (keyring: OAuthTransactionKeyring) => Layer.effect(this, make(keyring));
}
