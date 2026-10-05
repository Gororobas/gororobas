import {
  selectCallback,
  OAuthProtocol,
  OAuthProviderKey,
  OAuthProtocolRejected,
  OAuthRejected,
  OAuthUnavailable,
  OAuthCallbackId,
  OAuthCodeResponse,
  OAuthDisplayProfile,
  OAuthProtocolConfiguration,
  OAuthProtocolPreparation,
  OAuthTransactionSecrets,
  OAuthVerifiedExternalIdentity,
  snapshotOAuth,
} from "@yielded/auth/OAuth";
import { RequestBindingFlowId } from "@yielded/auth/Operations";
import { reportAuthFailure } from "@yielded/auth/Persistence";
import { Cause, DateTime, Effect, Layer, Redacted, Schema } from "effect";
import * as client from "openid-client";

import { DefiniteTokenRejection, tokenCompatibility } from "./compatibility";
import {
  clientAuthentication,
  installConfigurations,
  makeAuthorizationParameters,
  type InstalledProvider,
} from "./configuration";
import {
  type OpenIdClientConfigurationError,
  type OpenIdClientOAuthProtocolOptions,
} from "./models";
import { decodeOidcProfile } from "./profile";
import { boundedFetch } from "./transport";

const beginInput = Schema.Struct({
  provider: OAuthProviderKey,
  callbackId: Schema.optionalKey(OAuthCallbackId),
  flowId: RequestBindingFlowId,
});

const exchangeInput = Schema.toType(
  Schema.Struct({
    configuration: OAuthProtocolConfiguration,
    response: OAuthCodeResponse,
    secrets: OAuthTransactionSecrets,
    verificationStartedAt: Schema.DateTimeUtcFromMillis,
  }),
);

const numericDate = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 8640000000000 }));

const claimsSchema = Schema.Struct({
  iss: Schema.String,
  sub: OAuthVerifiedExternalIdentity.fields.identity.fields.subject,
  aud: Schema.Union([
    Schema.String,
    Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(1)),
  ]),
  azp: Schema.optionalKey(Schema.String),
  exp: numericDate,
  iat: numericDate,
  nbf: Schema.optionalKey(numericDate),
  auth_time: Schema.optionalKey(numericDate),
});

const plainIdentitySchema = Schema.Struct({
  subject: OAuthVerifiedExternalIdentity.fields.identity.fields.subject,
  profile: Schema.optionalKey(OAuthDisplayProfile),
});

const unavailable = () => OAuthUnavailable.make({});
const rejected = () => OAuthProtocolRejected.make({});

const unavailableOnDefect = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.tapCause((cause) =>
      Cause.hasDies(cause) ? reportAuthFailure("oauth-protocol", cause) : Effect.void,
    ),
    Effect.catchCause((cause): Effect.Effect<never, E | OAuthUnavailable> => {
      if (Cause.hasInterrupts(cause)) return Effect.interrupt;
      if (Cause.hasDies(cause)) return Effect.fail(unavailable());

      return Effect.failCause(cause);
    }),
  );

/** Only precise claim errors and a fully parsed invalid_grant are definite.
 * INVALID_RESPONSE also covers signature/key/transport faults; keep it ambiguous. */
const grantError = (error: unknown) => {
  if (
    error instanceof DefiniteTokenRejection ||
    (error instanceof client.ClientError && error.cause instanceof DefiniteTokenRejection)
  )
    return rejected();
  if (
    error instanceof client.ClientError &&
    (error.code === "OAUTH_JWT_CLAIM_COMPARISON_FAILED" ||
      error.code === "OAUTH_JWT_TIMESTAMP_CHECK_FAILED")
  )
    return rejected();
  if (
    error instanceof client.ResponseBodyError &&
    error.status === 400 &&
    error.error === "invalid_grant"
  )
    return rejected();

  return unavailable();
};

const privateConfiguration = <R>(
  entry: InstalledProvider<R>,
  timeout: number,
  fetch: client.CustomFetch,
  signal: AbortSignal,
) => {
  const provider = entry.provider;
  const compatibility = provider.protocol === "oauth" ? provider[tokenCompatibility] : undefined;

  const configuration = new client.Configuration(
    entry.metadata,
    provider.clientId,
    {
      [client.clockSkew]: 0,
      [client.clockTolerance]: 0,
      ...(provider.protocol === "oidc"
        ? { id_token_signed_response_alg: provider.idTokenSignedResponseAlg }
        : {}),
    },
    clientAuthentication(provider.authentication),
  );

  configuration.timeout = timeout;
  const transport = boundedFetch(fetch, signal, entry.allowedUrls);

  configuration[client.customFetch] =
    compatibility === undefined
      ? transport
      : async (url, options) => {
          const response = await transport(url, options);

          if (url === new URL(entry.metadata.token_endpoint!).href) {
            const body: unknown = await response.clone().json();

            signal.throwIfAborted();
            compatibility.inspectReceipt(
              { body, status: response.status, contentType: response.headers.get("content-type") },
              {
                scopes: provider.scopes,
                refreshRequired: false,
                operation: "authorization_code",
              },
            );
            signal.throwIfAborted();
          }

          return response;
        };
  if (provider.protocol === "oidc") client.enableNonRepudiationChecks(configuration);

  return configuration;
};

const jwksCaches = new Map<string, NonNullable<ReturnType<typeof client.getJwksCache>>>();

/** One JWKS cache per installed issuer generation. Request configurations stay private. */
const bindJwks = (
  provider: {
    readonly issuer: string;
    readonly configurationGeneration: string | number;
    readonly clientId: string;
  },
  configuration: client.Configuration,
) => {
  const key = `${provider.issuer}\u0000${String(provider.configurationGeneration)}\u0000${provider.clientId}`;
  const existing = jwksCaches.get(key);

  if (existing !== undefined) client.setJwksCache(configuration, existing);

  return () => {
    const next = client.getJwksCache(configuration);

    if (next !== undefined) jwksCaches.set(key, next);
  };
};

export const makeOpenIdClientOAuthProtocol = Effect.fn("makeOpenIdClientOAuthProtocol")(
  // Capture one provider table; each generation retains its own receipt rules.
  function* <R = never>(
    options: OpenIdClientOAuthProtocolOptions<R>,
  ): Effect.fn.Return<
    OAuthProtocol["Service"],
    OpenIdClientConfigurationError | OAuthUnavailable,
    R
  > {
    const context = yield* Effect.context<R>();
    const { installed, fetch, timeoutSeconds } = yield* installConfigurations(options);

    const prepareAuthorization: OAuthProtocol["Service"]["prepareAuthorization"] = Effect.fn(
      "OpenIdClient.prepareAuthorization",
    )(function* (input) {
      const request = yield* Schema.decodeEffect(beginInput)(input).pipe(
        Effect.mapError(() => OAuthRejected.make({})),
      );

      const entry = installed.find(
        ({ provider }) => provider.issuance === "active" && provider.provider === request.provider,
      );

      const provider = entry?.provider;

      const callback =
        provider === undefined
          ? undefined
          : selectCallback(provider.provider, provider.callbacks, request.callbackId);

      if (entry === undefined || provider === undefined || callback === undefined)
        return yield* OAuthRejected.make({});

      const result = yield* Effect.tryPromise({
        try: async (signal) => {
          const configuration = privateConfiguration(entry, timeoutSeconds, fetch, signal);

          const publishJwks = bindJwks(provider, configuration);

          try {
            const state = client.randomState();
            const verifier = client.randomPKCECodeVerifier();
            const nonce = provider.protocol === "oidc" ? client.randomNonce() : undefined;
            const challenge = await client.calculatePKCECodeChallenge(verifier);

            signal.throwIfAborted();

            const url = client.buildAuthorizationUrl(
              configuration,
              makeAuthorizationParameters(provider, callback.redirectUri, {
                state,
                challenge,
                ...(nonce === undefined ? {} : { nonce }),
              }),
            );

            return {
              configuration: {
                provider: provider.provider,
                protocol: provider.protocol,
                configurationGeneration: provider.configurationGeneration,
                issuer: provider.issuer,
                responseIssuerMode: provider.responseIssuerMode,
                callbackId: callback.callbackId,
                redirectUri: callback.redirectUri,
              },
              authorizationUrl: Redacted.make(url.href),
              secrets: {
                namespace: "effect-auth/oauth-transaction-secrets/v1" as const,
                state: Redacted.make(state),
                pkceVerifier: Redacted.make(verifier),
                ...(nonce === undefined ? {} : { oidcNonce: Redacted.make(nonce) }),
              },
            };
          } finally {
            publishJwks();
          }
        },
        catch: unavailable,
      });

      return yield* snapshotOAuth(OAuthProtocolPreparation, result);
    });

    const exchangeVerifiedIdentity: OAuthProtocol["Service"]["exchangeVerifiedIdentity"] =
      Effect.fn("OpenIdClient.exchangeVerifiedIdentity")(function* (input) {
        const request = yield* snapshotOAuth(exchangeInput, input);
        const saved = request.configuration;

        const entry = installed.find(
          ({ provider }) =>
            provider.provider === saved.provider &&
            provider.configurationGeneration === saved.configurationGeneration,
        );

        if (entry === undefined) return yield* unavailable();
        const provider = entry.provider;

        const callback = provider.callbacks.find(
          (candidate) => candidate.callbackId === saved.callbackId,
        );

        if (
          provider.protocol !== saved.protocol ||
          provider.issuer !== saved.issuer ||
          provider.responseIssuerMode !== saved.responseIssuerMode ||
          callback?.redirectUri !== saved.redirectUri
        )
          return yield* unavailable();
        if (
          (provider.protocol === "oidc") !== (request.secrets.oidcNonce !== undefined) ||
          Redacted.value(request.response.state) !== Redacted.value(request.secrets.state) ||
          (provider.responseIssuerMode === "required"
            ? request.response.issuer !== provider.issuer
            : request.response.issuer !== undefined)
        )
          return yield* rejected();
        const startedAt = DateTime.toEpochMillis(request.verificationStartedAt);

        if (startedAt < 0 || startedAt > DateTime.toEpochMillis(yield* DateTime.now))
          return yield* rejected();

        const exchanged = yield* Effect.tryPromise({
          try: async (signal) => {
            const configuration = privateConfiguration(entry, timeoutSeconds, fetch, signal);

            const publishJwks = bindJwks(provider, configuration);

            try {
              const currentUrl = new URL(saved.redirectUri);

              currentUrl.searchParams.set("code", Redacted.value(request.response.code));
              currentUrl.searchParams.set("state", Redacted.value(request.response.state));
              if (request.response.issuer !== undefined)
                currentUrl.searchParams.set("iss", request.response.issuer);

              const tokens = await client.authorizationCodeGrant(
                configuration,
                currentUrl,
                {
                  pkceCodeVerifier: Redacted.value(request.secrets.pkceVerifier),
                  expectedState: Redacted.value(request.secrets.state),
                  ...(provider.protocol === "oidc"
                    ? {
                        expectedNonce: Redacted.value(request.secrets.oidcNonce!),
                        idTokenExpected: true,
                        ...(provider.maxAgeSeconds === undefined
                          ? {}
                          : { maxAge: provider.maxAgeSeconds }),
                      }
                    : {}),
                },
                provider.tokenParameters,
              );

              signal.throwIfAborted();
              if (provider.protocol === "oidc")
                return { protocol: "oidc" as const, claims: tokens.claims() };
              if (tokens.token_type !== "bearer") throw unavailable();

              const response = await client.fetchProtectedResource(
                configuration,
                tokens.access_token,
                new URL(provider.identitySource.url),
                "GET",
                undefined,
                new Headers(provider.identitySource.headers),
              );

              signal.throwIfAborted();
              if (
                response.status !== 200 ||
                response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
                  "application/json"
              )
                throw unavailable();
              const body: unknown = await response.json();

              signal.throwIfAborted();

              return { protocol: "oauth" as const, body };
            } finally {
              publishJwks();
            }
          },
          catch: grantError,
        });

        if (exchanged.protocol === "oidc") {
          // oxlint-disable-next-line no-restricted-properties -- Project validated foreign ID-token claims into the adapter's stricter bounded profile.
          const claims = yield* Schema.decodeUnknownEffect(claimsSchema)(exchanged.claims).pipe(
            Effect.mapError(rejected),
          );

          const now = DateTime.toEpochMillis(yield* DateTime.now) / 1000;
          const audience = typeof claims.aud === "string" ? claims.aud : claims.aud[0];

          if (
            provider.protocol !== "oidc" ||
            claims.iss !== provider.issuer ||
            audience !== provider.clientId ||
            (claims.azp !== undefined && claims.azp !== provider.clientId) ||
            claims.exp <= now ||
            claims.iat > now ||
            (claims.nbf !== undefined && claims.nbf > now) ||
            (claims.auth_time !== undefined && claims.auth_time > now) ||
            (provider.maxAgeSeconds !== undefined &&
              (claims.auth_time === undefined ||
                claims.auth_time + provider.maxAgeSeconds < Math.floor(now)))
          )
            return yield* rejected();

          const profile = yield* decodeOidcProfile(exchanged.claims, provider.issuer);

          return yield* snapshotOAuth(OAuthVerifiedExternalIdentity, {
            identity: { provider: provider.provider, issuer: provider.issuer, subject: claims.sub },
            ...(profile === undefined ? {} : { profile }),
            ...(claims.auth_time === undefined
              ? {}
              : {
                  upstreamAuthenticatedAt: DateTime.makeUnsafe(
                    Math.min(startedAt, claims.auth_time * 1000),
                  ),
                }),
          });
        }
        if (provider.protocol !== "oauth") return yield* unavailable();

        const decoded = yield* Effect.suspend(() =>
          provider.identitySource.decodeIdentity(exchanged.body),
        ).pipe(
          Effect.provideContext(context),
          Effect.catchCause(
            (cause): Effect.Effect<never, OAuthProtocolRejected | OAuthUnavailable> => {
              if (Cause.hasInterrupts(cause))
                return reportAuthFailure("oauth-identity", cause).pipe(
                  Effect.andThen(Effect.interrupt),
                );
              if (
                cause.reasons.length === 1 &&
                cause.reasons[0]?._tag === "Fail" &&
                Schema.is(OAuthProtocolRejected)(cause.reasons[0].error)
              )
                return Effect.fail(rejected());

              return reportAuthFailure("oauth-identity", cause).pipe(
                Effect.andThen(Effect.fail(unavailable())),
              );
            },
          ),
        );

        const identity = yield* Schema.decodeEffect(plainIdentitySchema)(decoded).pipe(
          Effect.mapError(rejected),
        );

        return yield* snapshotOAuth(OAuthVerifiedExternalIdentity, {
          identity: {
            provider: provider.provider,
            issuer: provider.issuer,
            subject: identity.subject,
          },
          ...(identity.profile === undefined ? {} : { profile: identity.profile }),
        });
      });

    return OAuthProtocol.of({
      prepareAuthorization: (input) => unavailableOnDefect(prepareAuthorization(input)),
      exchangeVerifiedIdentity: (input) => unavailableOnDefect(exchangeVerifiedIdentity(input)),
    });
  },
  unavailableOnDefect,
);

export const openIdClientOAuthProtocolLayer = <R = never>(
  options: OpenIdClientOAuthProtocolOptions<R>,
) => Layer.effect(OAuthProtocol, makeOpenIdClientOAuthProtocol(options));
