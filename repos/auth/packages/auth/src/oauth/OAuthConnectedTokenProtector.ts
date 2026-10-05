import { Context, type Effect } from "effect";

import type {
  OAuthConnectedProtectionContext,
  OAuthConnectedSealedTokens,
  OAuthConnectedTokenMaterial,
} from "./connectedModels";
import type { OAuthUnavailable } from "./signInErrors";
import type { OAuthTransactionKeyring } from "./transactionKeyring";

export type OAuthConnectedTokenKeyring = OAuthTransactionKeyring;

/** Explicit encrypted long-lived tokens; dedicated key retention covers all live
 * grants and unresolved refresh/revocation work. Fixed typed AAD, no raw context. */
export class OAuthConnectedTokenProtector extends Context.Service<
  OAuthConnectedTokenProtector,
  {
    readonly seal: (input: {
      readonly context: OAuthConnectedProtectionContext;
      readonly material: OAuthConnectedTokenMaterial;
    }) => Effect.Effect<OAuthConnectedSealedTokens, OAuthUnavailable>;
    readonly open: (input: {
      readonly context: OAuthConnectedProtectionContext;
      readonly sealed: OAuthConnectedSealedTokens;
    }) => Effect.Effect<OAuthConnectedTokenMaterial, OAuthUnavailable>;
  }
>()("effect-auth/OAuthConnectedTokenProtector") {}
