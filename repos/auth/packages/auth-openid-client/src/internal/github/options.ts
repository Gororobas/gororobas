import {
  OAuthConnectedProfile,
  OAuthPermissionProfileKey,
  OAuthConnectedProtocol,
  OAuthProtocol,
  type ProviderDefinition,
  type OAuthUnavailable,
} from "@yielded/auth/OAuth";
import { Effect, Layer } from "effect";

import type { OpenIdClientConfigurationError } from "../openid-client/models";
import {
  resolveOptions,
  resolveRegistration,
  type RegistrationOptions,
} from "../openid-client/options";
import { makeOpenIdClientOAuthProtocol } from "../openid-client/protocol";
import { gitHubOAuthAppProviderKey } from "./identity";
import type { GitHubOAuthAppConnectedProtocolOptions, GitHubOAuthAppGeneration } from "./models";
import {
  gitHubOAuthAppProvider,
  makeGitHubOAuthAppConnectedProtocol,
  makeGitHubOAuthAppProtocol,
} from "./protocol";

/** GitHub.com OAuth App credentials and one or more exact callback destinations. */
export type Registration = Pick<GitHubOAuthAppGeneration, "clientId" | "clientSecret"> &
  RegistrationOptions;

type Transport = {
  /** Per-request timeout in seconds, from 1 to 30. Defaults to 10. */
  readonly timeoutSeconds?: number;
};

export type Options = Transport &
  (Registration | { readonly registrations: ReadonlyArray<Registration> });

export type ConnectedRegistration = Registration &
  Pick<GitHubOAuthAppConnectedProtocolOptions["registrations"][number], "profiles">;

export type ConnectedOptions = Transport &
  (ConnectedRegistration | { readonly registrations: ReadonlyArray<ConnectedRegistration> });

const registration = (input: Registration): GitHubOAuthAppGeneration => ({
  ...input,
  ...resolveRegistration(input, "github"),
});

export type ProviderRegistration = Pick<GitHubOAuthAppGeneration, "clientId" | "clientSecret"> &
  Pick<RegistrationOptions, "configurationGeneration" | "issuance">;

export type ProviderOptions = Transport & {
  readonly access?: ReadonlyArray<OAuthConnectedProfile>;
} & (ProviderRegistration | { readonly registrations: ReadonlyArray<ProviderRegistration> });

/** Provider API permissions and token retention, supplied to OAuth.make({ access }). */
export const accessProfile = (options: {
  readonly clientId: string;
  readonly scopes?: ReadonlyArray<string>;
  readonly maximumRefreshLifetimeMillis?: number;
}) =>
  OAuthConnectedProfile.make({
    key: OAuthPermissionProfileKey.make("github"),
    generation: 1,
    issuance: "active",
    provider: gitHubOAuthAppProviderKey,
    clientRegistrationId: options.clientId,
    scopes: options.scopes ?? ["read:user"],
    resources: [],
    retention: "access-and-refresh",
    maximumAccessLifetimeMillis: 8 * 60 * 60 * 1000,
    maximumRefreshLifetimeMillis: options.maximumRefreshLifetimeMillis ?? 30 * 24 * 60 * 60 * 1000,
    refreshAheadMillis: 60_000,
    refresh: "rotating",
    revocation: "cohort",
  });

/** Declare GitHub for Http.layer. The host supplies its provider key and
 * callback destinations. Retired registrations remain available to finish flows. */
export const provider = (
  options: ProviderOptions,
): ProviderDefinition<OpenIdClientConfigurationError | OAuthUnavailable> => ({
  configure: Effect.fn("GitHub.provider.configure")(function* (binding) {
    const registrations = yield* resolveOptions(() =>
      ("registrations" in options ? options.registrations : [options]).map((input) => ({
        ...input,
        ...resolveRegistration({ ...input, callbacks: binding.callbacks }, binding.provider),
      })),
    );

    const protocol = yield* makeOpenIdClientOAuthProtocol({
      providers: registrations.map((input) => ({
        ...gitHubOAuthAppProvider(input),
        provider: binding.provider,
      })),
      timeoutSeconds: options.timeoutSeconds ?? 10,
    });

    const profiles = options.access;

    if (profiles === undefined) return protocol;

    const connected = yield* makeGitHubOAuthAppConnectedProtocol({
      registrations: registrations.map((input) => ({
        ...input,
        profiles: profiles.filter((profile) => profile.clientRegistrationId === input.clientId),
      })),
      timeoutSeconds: options.timeoutSeconds ?? 10,
    });

    return { ...protocol, connected };
  }),
});

/** GitHub OAuth sign-in. Defaults to callback ID github, generation 1, active
 * issuance and a 10-second request timeout. Does not install HTTP routes.
 * For rotation, provide registrations with one active generation and retain
 * retired generations through their issued flows' lifetime. Configuration is
 * validated when the Layer builds; existing protocol safety rules still apply. */
export const layer = (options: Options) =>
  Layer.effect(
    OAuthProtocol,
    resolveOptions(() => ({
      registrations: ("registrations" in options ? options.registrations : [options]).map(
        registration,
      ),
      timeoutSeconds: options.timeoutSeconds === undefined ? 10 : options.timeoutSeconds,
    })).pipe(Effect.flatMap(makeGitHubOAuthAppProtocol)),
  );

/** Configure GitHub API connections with the same callback/rotation defaults as
 * layer. Permission profiles remain explicit; connection grants are not logins. */
export const layerConnected = (options: ConnectedOptions) =>
  Layer.effect(
    OAuthConnectedProtocol,
    resolveOptions(() => ({
      registrations: ("registrations" in options ? options.registrations : [options]).map(
        (input) => ({
          ...registration(input),
          profiles: input.profiles,
        }),
      ),
      timeoutSeconds: options.timeoutSeconds === undefined ? 10 : options.timeoutSeconds,
    })).pipe(Effect.flatMap(makeGitHubOAuthAppConnectedProtocol)),
  );
