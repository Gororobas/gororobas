import type { Redacted } from "effect";

import type { OAuthConnectedProfile } from "../../permissionProfile";
import { OAuthProviderKey } from "../../schema";
import { OAuthIssuer } from "../../signInModels";

export const providerKey = OAuthProviderKey.make("strava");
export const issuer = OAuthIssuer.make("https://www.strava.com");

export interface ProviderOptions {
  readonly clientId: string;
  readonly clientSecret: Redacted.Redacted<string>;
  readonly access?: OAuthConnectedProfile;
}
