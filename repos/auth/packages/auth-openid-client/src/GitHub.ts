export {
  layer,
  layerConnected,
  provider,
  accessProfile,
  type Options,
  type ProviderOptions,
  type ProviderRegistration,
  type Registration,
  type ConnectedOptions,
  type ConnectedRegistration,
} from "./internal/github/options";

export {
  type GitHubOAuthAppConnectedProtocolOptions,
  type GitHubOAuthAppGeneration,
  type GitHubOAuthAppProtocolOptions,
} from "./internal/github/models";

export { OpenIdClientConfigurationError } from "./internal/openid-client/models";

export {
  gitHubOAuthAppConnectedProtocolLayer,
  gitHubOAuthAppProtocolLayer,
  gitHubOAuthAppProvider,
  makeGitHubOAuthAppConnectedProtocol,
  makeGitHubOAuthAppProtocol,
} from "./internal/github/protocol";

export { gitHubOAuthAppProviderKey } from "./internal/github/identity";
export { GitHubUserProfile } from "./internal/github/profile";
