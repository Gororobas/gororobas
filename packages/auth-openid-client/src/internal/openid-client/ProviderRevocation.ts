import {
  type OAuthConnectedTokenContext,
  type OAuthConnectedTokenMaterial,
  OAuthUnavailable,
} from "@yielded/auth/OAuth";
import { Context, Effect, Layer } from "effect";

import type { OpenIdClientAuthentication } from "./models";

/** Private provider-owned cohort revocation; transport belongs to its adapter. */
export class ProviderRevocation extends Context.Service<
  ProviderRevocation,
  {
    readonly revoke: (input: {
      readonly clientId: string;
      readonly authentication: OpenIdClientAuthentication;
      readonly context: OAuthConnectedTokenContext;
      readonly material: OAuthConnectedTokenMaterial;
    }) => Effect.Effect<void, OAuthUnavailable>;
  }
>()("effect-auth/oauth/openid-client/ProviderRevocation") {
  static readonly layerUnsupported = Layer.succeed(ProviderRevocation, {
    revoke: () => Effect.fail(OAuthUnavailable.make({})),
  });
}
