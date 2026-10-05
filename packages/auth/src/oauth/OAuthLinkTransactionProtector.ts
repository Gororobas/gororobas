import { Context, type Effect } from "effect";

import type { OAuthLinkTransactionContext } from "./accountsModels";
import type { OAuthUnavailable } from "./signInErrors";
import type { OAuthTransactionSecrets, OAuthSealedTransaction } from "./signInModels";

/** Typed authenticated-link domain, isolated from guest sign-in. Dedicated keyring
 * retention covers issued and claimed link horizons and deployment convergence;
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
>()("effect-auth/OAuthLinkTransactionProtector") {}
