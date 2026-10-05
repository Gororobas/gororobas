import { type OAuthConnectedProfile, type OAuthProtocolConfiguration } from "@yielded/auth/OAuth";
import type { Redacted } from "effect";

export { OpenIdClientConfigurationError } from "../openid-client/models";

/** GitHub.com OAuth App credentials, distinct from GitHub App installation or user tokens. */
export interface GitHubOAuthAppGeneration {
  readonly configurationGeneration: OAuthProtocolConfiguration["configurationGeneration"];
  readonly issuance: "active" | "retired";
  readonly clientId: string;
  readonly clientSecret: Redacted.Redacted<string>;
  readonly callbacks: ReadonlyArray<{
    readonly callbackId: OAuthProtocolConfiguration["callbackId"];
    readonly redirectUri: OAuthProtocolConfiguration["redirectUri"];
  }>;
}

export interface GitHubOAuthAppProtocolOptions {
  readonly registrations: ReadonlyArray<GitHubOAuthAppGeneration>;
  readonly timeoutSeconds: number;
}

export interface GitHubOAuthAppConnectedProtocolOptions {
  readonly registrations: ReadonlyArray<
    GitHubOAuthAppGeneration & {
      /** Each profile uses provider "github" and its actual clientId as clientRegistrationId. */
      readonly profiles: ReadonlyArray<OAuthConnectedProfile>;
    }
  >;
  readonly timeoutSeconds: number;
}
