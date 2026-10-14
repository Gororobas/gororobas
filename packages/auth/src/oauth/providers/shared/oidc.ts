import { Hmac } from "@yielded/crypto/Hmac";
import { Signature } from "@yielded/crypto/Signature";
import type * as OAuth from "@yielded/oauth/OAuth";
import * as Oidc from "@yielded/oauth/Oidc";
import { Context, Crypto, Effect, type Redacted } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";

import { OAuthUnavailable } from "../../signInErrors";
import { installProvider, prepareConfigurations, type InstalledProvider } from "./configuration";
import {
  installConnectedProvider,
  prepareConnectedConfigurations,
  type InstalledConnectedProvider,
} from "./connected/configuration";
import type { OpenIdConnectConnectedProtocolOptions } from "./connected/models";
import { discoveryMetadataUrl, discoveryProfile, supplementDiscovery } from "./discovery";
import {
  hasStaticSecret,
  OpenIdConnectConfigurationError,
  type OpenIdConnectOAuthProtocolOptions,
} from "./models";
import type { Requirements as OAuthRequirements } from "./native";

export type Requirements = OAuthRequirements | Signature | Hmac;

const configurationError = (error: Effect.Error<ReturnType<typeof Oidc.discover>>) =>
  error._tag === "OAuthConfigurationError"
    ? OpenIdConnectConfigurationError.make({ reason: "metadata" })
    : OAuthUnavailable.make({});

/** Inward discovery port. One initialization owns the successful raw responses;
 * exact discovery policy and effective transport identities stay independent. */
export class ProviderDiscovery extends Context.Service<
  ProviderDiscovery,
  {
    readonly discover: (
      issuer: string,
      timeoutSeconds: number,
      metadataUrl: string | undefined,
    ) => Effect.Effect<
      OAuth.Metadata,
      OpenIdConnectConfigurationError | OAuthUnavailable,
      HttpClient.HttpClient
    >;
  }
>()("effect-auth/oauth/providers/ProviderDiscovery") {
  /** Evaluate once at each initialization root, never at module or declaration scope. */
  static readonly make = Effect.sync(() => {
    const cache = new Map<
      string,
      {
        readonly client: HttpClient.HttpClient;
        readonly fetch: typeof globalThis.fetch;
        readonly metadata: OAuth.Metadata;
      }
    >();

    return ProviderDiscovery.of({
      discover: Effect.fnUntraced(function* (
        issuer: string,
        timeoutSeconds: number,
        metadataUrl: string | undefined,
      ) {
        const client = yield* HttpClient.HttpClient;
        const fetch = yield* FetchHttpClient.Fetch;
        // oxlint-disable-next-line no-restricted-properties -- Collision-free tuple of bounded, validated discovery configuration.
        const key = JSON.stringify([issuer, timeoutSeconds, metadataUrl ?? null]);
        const found = cache.get(key);

        if (found?.client === client && found.fetch === fetch) return found.metadata;

        const metadata = yield* Oidc.discover(issuer, {
          timeoutMs: timeoutSeconds * 1000,
          ...(metadataUrl === undefined ? {} : { metadataUrl }),
        }).pipe(Effect.mapError(configurationError));

        cache.set(key, { client, fetch, metadata });

        return metadata;
      }),
    });
  });
}

const makeVerifier = Effect.fn("OpenIdConnect.makeVerifier")(function* (
  metadata: OAuth.Metadata,
  clientId: string,
  timeoutSeconds: number,
  options: {
    readonly algorithms: ReadonlyArray<Oidc.IdTokenAlgorithm>;
    readonly pkceS256: boolean;
    readonly clientSecret?: Redacted.Redacted<string>;
  },
) {
  const context = Context.make(Crypto.Crypto, yield* Crypto.Crypto).pipe(
    Context.add(Signature, yield* Signature),
    Context.add(Hmac, yield* Hmac),
  );

  const verifier = yield* Oidc.makeVerifier({
    metadata,
    clientId,
    timeoutMs: timeoutSeconds * 1000,
    algorithms: options.algorithms,
    pkceS256: options.pkceS256,
    ...(options.clientSecret === undefined ? {} : { clientSecret: options.clientSecret }),
  }).pipe(Effect.mapError(configurationError));

  return {
    verify: (token: Redacted.Redacted<string>, input: Oidc.VerificationInput) =>
      verifier.verify(token, input).pipe(Effect.provideContext(context)),
  };
});

/** Only the OIDC adapter installs discovery and signed ID-token verification. */
export const installConfigurations = Effect.fn("OpenIdConnect.installConfigurations")(function* <R>(
  input: OpenIdConnectOAuthProtocolOptions<R>,
) {
  const discovery = yield* ProviderDiscovery;
  const { providers, timeoutSeconds } = yield* prepareConfigurations(input);
  const installed: InstalledProvider<R>[] = [];

  for (const provider of providers) {
    const raw =
      provider.protocol === "oidc"
        ? yield* discovery
            .discover(
              provider.issuer,
              timeoutSeconds,
              discoveryMetadataUrl(provider[discoveryProfile]),
            )
            .pipe(
              Effect.flatMap((metadata) =>
                supplementDiscovery(metadata, provider[discoveryProfile]),
              ),
            )
        : {
            issuer: provider.issuer,
            authorization_endpoint: provider.authorizationEndpoint,
            token_endpoint: provider.tokenEndpoint,
            authorization_response_iss_parameter_supported:
              provider.responseIssuerMode === "required",
          };

    const entry = yield* installProvider(provider, raw, timeoutSeconds);

    installed.push(
      provider.protocol === "oidc"
        ? {
            ...entry,
            verifier: yield* makeVerifier(entry.metadata, provider.clientId, timeoutSeconds, {
              algorithms: provider.idTokenSignedResponseAlg,
              pkceS256: provider.pkceS256,
              ...(hasStaticSecret(provider.authentication)
                ? { clientSecret: provider.authentication.secret }
                : {}),
            }),
          }
        : entry,
    );
  }

  return { installed, timeoutSeconds };
});

export const installConnectedConfigurations = Effect.fn(
  "OpenIdConnect.installConnectedConfigurations",
)(function* <R>(input: OpenIdConnectConnectedProtocolOptions<R>) {
  const discovery = yield* ProviderDiscovery;
  const { providers, timeoutSeconds } = yield* prepareConnectedConfigurations(input);
  const installed: InstalledConnectedProvider<R>[] = [];

  for (const provider of providers) {
    const raw =
      provider.protocol === "oidc"
        ? yield* discovery.discover(provider.issuer, timeoutSeconds, undefined)
        : {
            issuer: provider.issuer,
            authorization_endpoint: provider.authorizationEndpoint,
            token_endpoint: provider.tokenEndpoint,
            authorization_response_iss_parameter_supported:
              provider.responseIssuerMode === "required",
            ...(provider.revocation.mode === "rfc7009"
              ? { revocation_endpoint: provider.revocation.endpoint }
              : {}),
          };

    const entry = yield* installConnectedProvider(provider, raw, timeoutSeconds);

    installed.push(
      provider.protocol === "oidc"
        ? {
            ...entry,
            verifier: yield* makeVerifier(entry.metadata, provider.clientId, timeoutSeconds, {
              algorithms: provider.idTokenSignedResponseAlg,
              pkceS256: provider.pkceS256,
              ...(hasStaticSecret(provider.authentication)
                ? { clientSecret: provider.authentication.secret }
                : {}),
            }),
          }
        : entry,
    );
  }

  return { installed, timeoutSeconds };
});
