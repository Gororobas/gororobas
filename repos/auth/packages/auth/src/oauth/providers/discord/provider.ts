import * as Schema from "effect/Schema";

import { makeOidcPreset, OidcPresetRegistration, type OidcPresetOptions } from "../shared/preset";
import { DiscordUserProfile } from "./profile";

const Registration = Schema.Struct({
  ...OidcPresetRegistration.fields,
  scopes: Schema.optionalKey(Schema.Array(Schema.Literals(["openid", "identify", "email"]))),
});

export type ProviderRegistration = typeof Registration.Type;
export type ProviderOptions = OidcPresetOptions<ProviderRegistration>;

/** Discord OpenID Connect from its published discovery, with S256 PKCE and required
 * response iss. The preset merges UserInfo: identify adds the username, display name
 * and avatar, and email adds the address. */
export const provider = (options: ProviderOptions) =>
  makeOidcPreset(options, Registration, (registration) => ({
    ...registration,
    protocol: "oidc",
    issuer: "https://discord.com",
    userInfo: "merge",
    profileSchema: DiscordUserProfile,
  }));
