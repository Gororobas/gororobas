import { makeOidcPreset, OidcPresetRegistration, type OidcPresetOptions } from "../shared/preset";
import { ZoomUserProfile } from "./profile";

export type ProviderRegistration = typeof OidcPresetRegistration.Type;
export type ProviderOptions = OidcPresetOptions<ProviderRegistration>;

/** Zoom OpenID Connect with standard claims and required response issuer validation. */
export const provider = (options: ProviderOptions) =>
  makeOidcPreset(options, OidcPresetRegistration, (registration) => ({
    ...registration,
    protocol: "oidc",
    issuer: "https://zoom.us",
    profileSchema: ZoomUserProfile,
  }));
