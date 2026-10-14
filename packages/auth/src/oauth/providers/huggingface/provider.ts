import { makeOidcPreset, OidcPresetRegistration, type OidcPresetOptions } from "../shared/preset";
import { HuggingFaceUserProfile } from "./profile";

export type ProviderRegistration = typeof OidcPresetRegistration.Type;
export type ProviderOptions = OidcPresetOptions<ProviderRegistration>;

/** Hugging Face OpenID Connect with standard claims. Give this issuer a distinct
 * callback because it does not advertise response iss. */
export const provider = (options: ProviderOptions) =>
  makeOidcPreset(options, OidcPresetRegistration, (registration) => ({
    ...registration,
    protocol: "oidc",
    issuer: "https://huggingface.co",
    responseIssuerMode: "unsupported",
    profileSchema: HuggingFaceUserProfile,
  }));
