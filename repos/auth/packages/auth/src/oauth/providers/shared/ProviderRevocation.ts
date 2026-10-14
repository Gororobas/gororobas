import { Context, Effect, Layer } from "effect";

import {
  type OAuthConnectedTokenContext,
  type OAuthConnectedTokenMaterial,
} from "../../connectedModels";
import { OAuthUnavailable } from "../../signInErrors";
import type { OpenIdConnectAuthentication } from "./models";

/** Private provider-owned cohort revocation; transport belongs to its adapter. */
export class ProviderRevocation extends Context.Service<
  ProviderRevocation,
  {
    readonly revoke: (input: {
      readonly clientId: string;
      readonly authentication: OpenIdConnectAuthentication;
      readonly context: OAuthConnectedTokenContext;
      readonly material: OAuthConnectedTokenMaterial;
    }) => Effect.Effect<void, OAuthUnavailable>;
  }
>()("effect-auth/oauth/providers/ProviderRevocation") {
  static readonly layerUnsupported = Layer.succeed(ProviderRevocation, {
    revoke: () => Effect.fail(OAuthUnavailable.make({})),
  });
}
