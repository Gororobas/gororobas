import { Context, type Effect } from "effect";

import type { OAuthUnavailable } from "./signInErrors";
import type {
  OAuthTransactionSecrets,
  OAuthSealedTransaction,
  OAuthSignInTransactionContext,
} from "./signInModels";

/** Dedicated transaction encryption. Retain retired keys through every pending
 * and claimed flow horizon and deployment convergence; binder signing keys have
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
>()("effect-auth/OAuthTransactionProtector") {}
