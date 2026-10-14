export {
  layer,
  provider,
  type Options,
  type Provider,
  type ProviderOptions,
  type ProviderRegistration,
} from "./oauth/providers/shared/layer";

export {
  type IdTokenSignedResponseAlg,
  type OidcProfileSchema,
  type OidcSubjectDecoder,
  type OidcUserInfoMode,
  type OpenIdConnectAuthentication,
  OpenIdConnectConfigurationError,
  type OpenIdConnectOAuthProtocolOptions,
  type OpenIdConnectOAuthProvider,
  type OpenIdConnectOidcProvider,
  type PlainOAuthHttpIdentitySource,
  type PlainOAuthIdentity,
  type PlainOAuthIdentityDecoder,
  type PlainOAuthIdentitySource,
  type PlainOAuthTokenIdentitySource,
} from "./oauth/providers/shared/models";

export { OidcStandardUserProfile, OidcUserProfile } from "./oauth/providers/shared/profile";

export {
  layer as layerConnected,
  type Options as ConnectedOptions,
  type Provider as ConnectedProvider,
} from "./oauth/providers/shared/connected/layer";

export type {
  OpenIdConnectConnectedOAuthProvider,
  OpenIdConnectConnectedOidcProvider,
  OpenIdConnectConnectedProtocolOptions,
  OpenIdConnectConnectedRefreshExpiry,
  OpenIdConnectConnectedRevocation,
} from "./oauth/providers/shared/connected/models";

export type { Requirements } from "./oauth/providers/shared/oidc";
