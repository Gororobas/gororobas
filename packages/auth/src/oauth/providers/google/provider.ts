import { Schema } from "effect";

import { makeOidcPreset, OidcPresetRegistration, type OidcPresetOptions } from "../shared/preset";
import { GoogleUserProfile } from "./profile";

const Registration = Schema.Struct({
  ...OidcPresetRegistration.fields,
  hd: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(253))),
});

export type ProviderRegistration = typeof Registration.Type;
export type ProviderOptions = OidcPresetOptions<ProviderRegistration>;

/** Google OpenID Connect with client_secret_post, account selection and offline
 * consent. hd is a consent hint; enforce Workspace policy against verified claims. */
export const provider = (options: ProviderOptions) =>
  makeOidcPreset(options, Registration, ({ hd, ...registration }) => ({
    ...registration,
    protocol: "oidc",
    issuer: "https://accounts.google.com",
    tokenEndpointAuthMethod: "client_secret_post",
    profileSchema: GoogleUserProfile,
    authorizationParameters: {
      prompt: "select_account",
      access_type: "offline",
      ...(hd === undefined ? {} : { hd }),
    },
  }));
