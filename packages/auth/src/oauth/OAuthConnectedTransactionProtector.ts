import { Context, type Effect } from "effect";

import type {
  OAuthConnectedTransactionContext,
  OAuthConnectedTransactionSecrets,
  OAuthConnectedSealedTransaction,
} from "./connectedModels";
import type { OAuthUnavailable } from "./signInErrors";

/** Separate connected purpose. Key retention includes original claim horizons. */
export class OAuthConnectedTransactionProtector extends Context.Service<
  OAuthConnectedTransactionProtector,
  {
    readonly seal: (input: {
      readonly context: OAuthConnectedTransactionContext;
      readonly secrets: OAuthConnectedTransactionSecrets;
    }) => Effect.Effect<OAuthConnectedSealedTransaction, OAuthUnavailable>;
    readonly open: (input: {
      readonly context: OAuthConnectedTransactionContext;
      readonly sealed: OAuthConnectedSealedTransaction;
    }) => Effect.Effect<OAuthConnectedTransactionSecrets, OAuthUnavailable>;
  }
>()("effect-auth/OAuthConnectedTransactionProtector") {}
