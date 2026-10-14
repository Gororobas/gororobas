import { Context, type Effect, Layer } from "effect";

import type { OAuthLinkTransactionContext } from "./accountsModels";
import { make } from "./encryption/OAuthLinkTransactionProtector";
import type { OAuthUnavailable } from "./signInErrors";
import type { OAuthTransactionSecrets, OAuthSealedTransaction } from "./signInModels";
import type { OAuthTransactionKeyring } from "./transactionKeyring";

/** Typed authenticated-link domain, isolated from guest sign-in. Layer teardown
 * cancels and joins active operations before wiping keys; later calls fail closed.
 * Dedicated keyring retention covers issued and claimed link horizons and deployment convergence;
 * link-binder signing keys have their own independent retention obligation. */
export class OAuthLinkTransactionProtector extends Context.Service<
  OAuthLinkTransactionProtector,
  {
    readonly seal: (input: {
      readonly context: OAuthLinkTransactionContext;
      readonly secrets: OAuthTransactionSecrets;
    }) => Effect.Effect<OAuthSealedTransaction, OAuthUnavailable>;
    readonly open: (input: {
      readonly context: OAuthLinkTransactionContext;
      readonly sealed: OAuthSealedTransaction;
    }) => Effect.Effect<OAuthTransactionSecrets, OAuthUnavailable>;
  }
>()("effect-auth/OAuthLinkTransactionProtector") {
  static readonly layer = (keyring: OAuthTransactionKeyring) => Layer.effect(this, make(keyring));
}
