export {
  layer,
  layerConnected,
  provider,
  type Options,
  type ProviderOptions,
  type ProviderRegistration,
  type Registration,
  type ConnectedOptions,
  type ConnectedRegistration,
} from "./oauth/providers/github/provider";

export {
  type GitHubOAuthAppConnectedProtocolOptions,
  type GitHubOAuthAppGeneration,
  type GitHubOAuthAppProtocolOptions,
} from "./oauth/providers/github/models";

export { OpenIdConnectConfigurationError } from "./oauth/providers/shared/models";

export { gitHubOAuthAppProvider } from "./oauth/providers/github/protocol";

export { accessProfile } from "./oauth/providers/github/access";
export { gitHubOAuthAppProviderKey } from "./oauth/providers/github/models";
export { GitHubUserProfile } from "./oauth/providers/github/profile";
