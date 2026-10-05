import type { Effect } from "effect";

import type { OAuthConnectedProtocol } from "./OAuthConnectedProtocol";
import type { OAuthProtocol } from "./OAuthProtocol";
import type { OAuthProviderKey } from "./schema";
import type { OAuthCallbackId, OAuthRedirectUri } from "./signInModels";

/** A server-side provider declaration. The host supplies its stable provider key
 * and exact callback destinations; the adapter owns discovery and exchanges.
 * Importing this contract does not load any optional protocol implementation. */
export interface ProviderDefinition<E = never, R = never> {
  readonly configure: (binding: {
    readonly provider: OAuthProviderKey;
    readonly callbacks: ReadonlyArray<{
      readonly callbackId: typeof OAuthCallbackId.Type;
      readonly redirectUri: typeof OAuthRedirectUri.Type;
    }>;
  }) => Effect.Effect<
    OAuthProtocol["Service"] & { readonly connected?: OAuthConnectedProtocol["Service"] },
    E,
    R
  >;
}
