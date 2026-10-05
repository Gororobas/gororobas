import {
  OAuthConnectedProfile,
  OAuthProviderKey,
  OAuthUnavailable,
  OAuthCallbackId,
  OAuthGeneration,
  OAuthIssuer,
  OAuthRedirectUri,
  freezeOAuth,
  snapshotOAuthSync,
} from "@yielded/auth/OAuth";
import { Effect, Predicate, Redacted, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import * as client from "openid-client";

import type { ConnectedOptions, ProviderConnectedOAuth } from "../compatibility";
import { callbackEndpoint, clientAuthentication, endpoint } from "../configuration";
import { OpenIdClientConfigurationError, type OpenIdClientAuthentication } from "../models";
import { boundedFetch } from "../transport";
import type {
  OpenIdClientConnectedOAuthProvider,
  OpenIdClientConnectedOidcProvider,
} from "./models";

const text = (maximum: number) => Schema.NonEmptyString.check(Schema.isMaxLength(maximum));

const fields = Schema.Record(
  Schema.String.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9._~-]{0,63}$/)),
  Schema.String.check(Schema.isMaxLength(2048)),
).check(Schema.makeFilter((value) => Object.keys(value).length <= 16));

const authentication = Schema.Union([
  Schema.Struct({
    method: Schema.Literal("client_secret_basic"),
    secret: Schema.RedactedFromValue(text(4096)),
  }),
  Schema.Struct({
    method: Schema.Literal("client_secret_post"),
    secret: Schema.RedactedFromValue(text(4096)),
  }),
  Schema.Struct({ method: Schema.Literal("none"), publicClient: Schema.Literal(true) }),
]);

const common = {
  provider: OAuthProviderKey,
  configurationGeneration: OAuthGeneration,
  issuance: Schema.Literals(["active", "retired"]),
  issuer: OAuthIssuer,
  responseIssuerMode: Schema.Literals(["required", "unsupported"]),
  clientId: text(1024),
  authentication,
  callbacks: Schema.Array(
    Schema.Struct({ callbackId: OAuthCallbackId, redirectUri: OAuthRedirectUri }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
  authorizationParameters: Schema.optionalKey(fields),
  tokenParameters: Schema.optionalKey(fields),
  refreshParameters: Schema.optionalKey(fields),
  clientRegistrationId: OAuthConnectedProfile.fields.clientRegistrationId,
  profiles: Schema.Array(OAuthConnectedProfile).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(64),
  ),
  resourceIndicators: Schema.Literals(["unsupported", "rfc8707"]),
  refreshExpiry: Schema.Union([
    Schema.Literal("unreported"),
    Schema.Struct({
      field: Schema.Literals(["refresh_expires_in", "refresh_token_expires_in"]),
      zero: Schema.Literals(["unreported", "expired"]),
    }),
  ]),
  revocation: Schema.Union([
    Schema.Struct({ mode: Schema.Literal("unsupported") }),
    Schema.Struct({
      mode: Schema.Literal("rfc7009"),
      scope: Schema.Literal("cohort"),
      tokenTypes: Schema.Literals(["access", "access-and-refresh"]),
      authentication,
      endpoint: Schema.optionalKey(text(2048)),
    }),
  ]),
};

const optionsSchema = <R>(providerCohort: boolean) =>
  Schema.toType(
    Schema.Struct({
      providers: Schema.Array(
        Schema.Union([
          Schema.Struct({
            ...common,
            protocol: Schema.Literal("oidc"),
            idTokenSignedResponseAlg: Schema.Literal("RS256"),
            maxAgeSeconds: Schema.optionalKey(
              Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 86400 })),
            ),
          }),
          Schema.Struct({
            ...common,
            revocation: providerCohort
              ? Schema.Union([
                  common.revocation,
                  Schema.Struct({ mode: Schema.Literal("provider-cohort") }),
                ])
              : common.revocation,
            protocol: Schema.Literal("oauth"),
            authorizationEndpoint: text(2048),
            tokenEndpoint: text(2048),
            pkceS256: Schema.Literal(true),
            identitySource: Schema.Struct({
              url: text(2048),
              headers: Schema.optionalKey(fields),
              decodeIdentity: Schema.declare<
                OpenIdClientConnectedOAuthProvider<R>["identitySource"]["decodeIdentity"]
              >(
                (
                  value,
                ): value is OpenIdClientConnectedOAuthProvider<R>["identitySource"]["decodeIdentity"] =>
                  Predicate.isFunction(value),
              ),
            }),
          }),
        ]),
      ).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
      timeoutSeconds: Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 30 })),
    }),
  );

const reserved = new Set([
  "client_id",
  "client_secret",
  "client_assertion",
  "client_assertion_type",
  "redirect_uri",
  "response_type",
  "response_mode",
  "state",
  "code",
  "code_verifier",
  "code_challenge",
  "code_challenge_method",
  "nonce",
  "scope",
  "resource",
  "audience",
  "iss",
  "grant_type",
  "refresh_token",
  "token",
  "token_type_hint",
  "max_age",
  "request",
  "request_uri",
  "authorization_details",
  "id_token_hint",
  "login_hint",
  "login_hint_token",
  "subject_token",
  "subject_token_type",
  "actor_token",
  "actor_token_type",
  "requested_token_type",
]);

// oxlint-disable-next-line no-restricted-properties -- Collision-free fingerprints for bounded local configuration tuple indexes.
const tupleKey = (values: ReadonlyArray<string | number>) => JSON.stringify(values);

const forbiddenHeaders = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "host",
  "content-length",
  "content-type",
  "transfer-encoding",
  "connection",
  "upgrade",
  "trailer",
  "te",
]);

const configurationError = (reason: OpenIdClientConfigurationError["reason"]) =>
  OpenIdClientConfigurationError.make({ reason });

const copyAuth = (value: OpenIdClientAuthentication): OpenIdClientAuthentication =>
  value.method === "none"
    ? { ...value }
    : { ...value, secret: Redacted.make(Redacted.value(value.secret)) };

const copyRevocation = <
  T extends
    | OpenIdClientConnectedOAuthProvider<never>["revocation"]
    | ProviderConnectedOAuth<never>["revocation"],
>(
  value: T,
): T =>
  value.mode === "rfc7009"
    ? { ...value, authentication: copyAuth(value.authentication) }
    : { ...value };

export type ConnectedProvider<R> =
  | OpenIdClientConnectedOidcProvider
  | (Omit<OpenIdClientConnectedOAuthProvider<R>, "revocation"> & {
      readonly revocation:
        | OpenIdClientConnectedOAuthProvider<R>["revocation"]
        | ProviderConnectedOAuth<R>["revocation"];
    });

export interface InstalledConnectedProvider<R> {
  readonly provider: ConnectedProvider<R>;
  readonly metadata: client.ServerMetadata;
  readonly allowedUrls: ReadonlySet<string>;
}

const metadataSchema = Schema.Struct({
  issuer: OAuthIssuer,
  authorization_endpoint: text(2048),
  token_endpoint: text(2048),
  jwks_uri: Schema.optionalKey(text(2048)),
  revocation_endpoint: Schema.optionalKey(text(2048)),
  code_challenge_methods_supported: Schema.optionalKey(
    Schema.Array(text(64)).check(Schema.isMaxLength(64)),
  ),
  response_types_supported: Schema.optionalKey(
    Schema.Array(text(64)).check(Schema.isMaxLength(64)),
  ),
  grant_types_supported: Schema.optionalKey(Schema.Array(text(128)).check(Schema.isMaxLength(64))),
  id_token_signing_alg_values_supported: Schema.optionalKey(
    Schema.Array(text(64)).check(Schema.isMaxLength(64)),
  ),
  token_endpoint_auth_methods_supported: Schema.optionalKey(
    Schema.Array(text(64)).check(Schema.isMaxLength(64)),
  ),
  revocation_endpoint_auth_methods_supported: Schema.optionalKey(
    Schema.Array(text(64)).check(Schema.isMaxLength(64)),
  ),
  authorization_response_iss_parameter_supported: Schema.optionalKey(Schema.Boolean),
});

/** The issuance flag selects new authorization only; retained profile content is immutable. */
export const sameConnectedProfile = (
  registered: OAuthConnectedProfile,
  saved: OAuthConnectedProfile,
) =>
  Schema.encodeSync(Schema.fromJsonString(OAuthConnectedProfile))({
    ...registered,
    issuance: saved.issuance,
  }) === Schema.encodeSync(Schema.fromJsonString(OAuthConnectedProfile))(saved);

export const installConnectedConfigurations = Effect.fn(
  "OpenIdClient.installConnectedConfigurations",
)(function* <R>(input: ConnectedOptions<R>, providerCohort = false) {
  const options = yield* Schema.decodeEffect(optionsSchema<R>(providerCohort))(input).pipe(
    Effect.mapError(() => configurationError("provider")),
  );

  const providers: ConnectedProvider<R>[] = yield* Effect.try({
    try: () =>
      options.providers.map((provider): ConnectedProvider<R> => {
        const detached = {
          authentication: copyAuth(provider.authentication),
          callbacks: provider.callbacks.map((value) => ({ ...value })),
          profiles: provider.profiles.map((value) =>
            snapshotOAuthSync(OAuthConnectedProfile, value),
          ),
          ...(provider.authorizationParameters
            ? { authorizationParameters: { ...provider.authorizationParameters } }
            : {}),
          ...(provider.tokenParameters ? { tokenParameters: { ...provider.tokenParameters } } : {}),
          ...(provider.refreshParameters
            ? { refreshParameters: { ...provider.refreshParameters } }
            : {}),
          refreshExpiry:
            provider.refreshExpiry === "unreported"
              ? provider.refreshExpiry
              : { ...provider.refreshExpiry },
        };

        return provider.protocol === "oidc"
          ? { ...provider, ...detached, revocation: copyRevocation(provider.revocation) }
          : {
              ...provider,
              ...detached,
              revocation: copyRevocation(provider.revocation),
              identitySource: {
                ...provider.identitySource,
                ...(provider.identitySource.headers
                  ? { headers: { ...provider.identitySource.headers } }
                  : {}),
              },
            };
      }),
    catch: () => configurationError("provider"),
  });

  const transport = yield* FetchHttpClient.Fetch;

  const fetch: client.CustomFetch = (url, { body, ...init }) =>
    transport(url, {
      ...init,
      ...(body === undefined
        ? {}
        : { body: body instanceof Uint8Array ? new Uint8Array(body) : body }),
    });

  yield* Effect.try({
    try: () => {
      const generations = new Set<string>(),
        active = new Set<string>(),
        aliases = new Map<string, string>(),
        registrations = new Map<string, string>();

      let profileCount = 0;

      for (const provider of providers) {
        const generationKey = tupleKey([provider.provider, provider.configurationGeneration]);

        if (
          generations.has(generationKey) ||
          (provider.issuance === "active" && active.has(provider.provider))
        )
          throw configurationError("generation");
        generations.add(generationKey);
        if (provider.issuance === "active") active.add(provider.provider);
        const issuer = endpoint(provider.issuer);

        if (provider.issuer.includes("?")) throw configurationError("issuer");

        const aliasKey = tupleKey([issuer.href, provider.clientId]),
          alias = tupleKey([provider.provider, provider.clientRegistrationId]);

        if (aliases.has(aliasKey) && aliases.get(aliasKey) !== alias)
          throw configurationError("provider");
        aliases.set(aliasKey, alias);

        const registration = tupleKey([
          provider.provider,
          issuer.href,
          provider.clientRegistrationId,
        ]);

        if (
          registrations.has(registration) &&
          registrations.get(registration) !== provider.clientId
        )
          throw configurationError("provider");
        registrations.set(registration, provider.clientId);
        const callbacks = new Set<string>();

        for (const callback of provider.callbacks) {
          const url = callbackEndpoint(callback.redirectUri);

          if (
            callbacks.has(callback.callbackId) ||
            callback.redirectUri.includes("?") ||
            url.href !== callback.redirectUri
          )
            throw configurationError("callback");
          callbacks.add(callback.callbackId);
        }
        for (const parameters of [
          provider.authorizationParameters,
          provider.tokenParameters,
          provider.refreshParameters,
        ])
          for (const key of Object.keys(parameters ?? {}))
            if (reserved.has(key.toLowerCase())) throw configurationError("parameters");

        const profiles = new Set<string>(),
          activeProfiles = new Set<string>();

        for (const profile of provider.profiles) {
          if (++profileCount > 64) throw configurationError("provider");
          const key = tupleKey([profile.key, profile.generation]);

          if (
            profiles.has(key) ||
            (profile.issuance === "active" && activeProfiles.has(profile.key)) ||
            profile.provider !== provider.provider ||
            profile.clientRegistrationId !== provider.clientRegistrationId ||
            new Set(profile.scopes).size !== profile.scopes.length ||
            new Set(profile.resources).size !== profile.resources.length ||
            profile.refreshAheadMillis >= profile.maximumAccessLifetimeMillis ||
            (provider.protocol === "oidc" && !profile.scopes.includes("openid")) ||
            (provider.resourceIndicators === "unsupported" && profile.resources.length !== 0) ||
            (profile.retention === "access-only" && profile.refresh !== "unsupported") ||
            (profile.retention === "access-and-refresh" &&
              (profile.refresh === "unsupported" ||
                profile.maximumRefreshLifetimeMillis === undefined ||
                (provider.authentication.method === "none" && profile.refresh !== "rotating"))) ||
            (profile.revocation === "cohort" &&
              (provider.revocation.mode === "unsupported" ||
                (provider.revocation.mode === "rfc7009" &&
                  profile.retention === "access-and-refresh" &&
                  provider.revocation.tokenTypes !== "access-and-refresh")))
          )
            throw configurationError("provider");
          profiles.add(key);
          if (profile.issuance === "active") activeProfiles.add(profile.key);
          for (const resource of profile.resources) {
            const uri = new URL(resource);

            if (
              resource.includes("#") ||
              // oxlint-disable-next-line no-control-regex -- Preserve exact resource URIs and reject ambiguous control characters.
              /[\s\\\u0000-\u001f\u007f]/u.test(resource) ||
              uri.username !== "" ||
              uri.password !== ""
            )
              throw configurationError("parameters");
          }
        }
        if (provider.protocol === "oauth") {
          endpoint(provider.authorizationEndpoint);
          endpoint(provider.tokenEndpoint);
          endpoint(provider.identitySource.url);
          const headers = new Set<string>();

          for (const [name, value] of Object.entries(provider.identitySource.headers ?? {})) {
            const lower = name.toLowerCase();

            if (forbiddenHeaders.has(lower) || headers.has(lower) || /[\r\n]/u.test(value))
              throw configurationError("identity-source");
            headers.add(lower);
          }
        }
        if (provider.revocation.mode === "rfc7009") {
          if (provider.protocol === "oauth" && provider.revocation.endpoint === undefined)
            throw configurationError("metadata");
          if (provider.revocation.endpoint) endpoint(provider.revocation.endpoint);
        }
        freezeOAuth(provider);
      }
    },
    catch: (error) =>
      Schema.is(OpenIdClientConfigurationError)(error) ? error : configurationError("provider"),
  });
  const installed: InstalledConnectedProvider<R>[] = [];

  for (const provider of providers) {
    let raw: client.ServerMetadata;

    if (provider.protocol === "oidc") {
      const discovery = new URL(provider.issuer);

      discovery.pathname = `${discovery.pathname.replace(/\/$/u, "")}/.well-known/openid-configuration`;

      const configuration = yield* Effect.tryPromise({
        try: (signal) =>
          client.discovery(
            new URL(provider.issuer),
            provider.clientId,
            {
              id_token_signed_response_alg: "RS256",
              [client.clockSkew]: 0,
              [client.clockTolerance]: 0,
            },
            clientAuthentication(provider.authentication),
            {
              timeout: options.timeoutSeconds,
              execute: [client.enableNonRepudiationChecks],
              [client.customFetch]: boundedFetch(fetch, signal, new Set([discovery.href])),
            },
          ),
        catch: () => OAuthUnavailable.make({}),
      });

      raw = configuration.serverMetadata();
    } else
      raw = {
        issuer: provider.issuer,
        authorization_endpoint: provider.authorizationEndpoint,
        token_endpoint: provider.tokenEndpoint,
        authorization_response_iss_parameter_supported: provider.responseIssuerMode === "required",
        ...(provider.revocation.mode === "rfc7009"
          ? { revocation_endpoint: provider.revocation.endpoint }
          : {}),
      };

    // oxlint-disable-next-line no-restricted-properties -- Validate foreign discovery metadata at this adapter's bounded boundary.
    const metadata = yield* Schema.decodeUnknownEffect(metadataSchema)(raw).pipe(
      Effect.mapError(() => configurationError("metadata")),
    );

    const allowedUrls = yield* Effect.try({
      try: () => {
        if (metadata.issuer !== provider.issuer) throw configurationError("issuer");
        if (
          (metadata.authorization_response_iss_parameter_supported === true) !==
          (provider.responseIssuerMode === "required")
        )
          throw configurationError("metadata");
        const authorization = endpoint(metadata.authorization_endpoint);

        for (const key of authorization.searchParams.keys())
          if (reserved.has(key.toLowerCase())) throw configurationError("parameters");
        const token = endpoint(metadata.token_endpoint);

        for (const key of token.searchParams.keys())
          if (reserved.has(key.toLowerCase())) throw configurationError("parameters");
        const urls = new Set([token.href]);

        const tokenAuthentication =
          metadata.token_endpoint_auth_methods_supported ??
          (provider.protocol === "oidc" ? ["client_secret_basic"] : undefined);

        if (tokenAuthentication && !tokenAuthentication.includes(provider.authentication.method))
          throw configurationError("authentication");
        if (provider.protocol === "oidc") {
          if (
            !metadata.code_challenge_methods_supported?.includes("S256") ||
            !metadata.response_types_supported?.includes("code") ||
            !metadata.id_token_signing_alg_values_supported?.includes("RS256") ||
            metadata.jwks_uri === undefined ||
            (provider.profiles.some((profile) => profile.retention === "access-and-refresh") &&
              !metadata.grant_types_supported?.includes("refresh_token"))
          )
            throw configurationError("metadata");
          urls.add(endpoint(metadata.jwks_uri).href);
        } else urls.add(endpoint(provider.identitySource.url).href);
        if (provider.revocation.mode === "rfc7009") {
          if (
            !metadata.revocation_endpoint ||
            (provider.revocation.endpoint !== undefined &&
              provider.revocation.endpoint !== metadata.revocation_endpoint)
          )
            throw configurationError("metadata");

          const auth =
            metadata.revocation_endpoint_auth_methods_supported ??
            (provider.protocol === "oidc" ? ["client_secret_basic"] : undefined);

          if (auth && !auth.includes(provider.revocation.authentication.method))
            throw configurationError("authentication");
          const revoke = endpoint(metadata.revocation_endpoint);

          for (const key of revoke.searchParams.keys())
            if (reserved.has(key.toLowerCase())) throw configurationError("parameters");
          urls.add(revoke.href);
        }

        return urls;
      },
      catch: (error) =>
        Schema.is(OpenIdClientConfigurationError)(error) ? error : configurationError("metadata"),
    });

    const {
      code_challenge_methods_supported,
      response_types_supported,
      grant_types_supported,
      id_token_signing_alg_values_supported,
      token_endpoint_auth_methods_supported,
      revocation_endpoint_auth_methods_supported,
      ...metadataFields
    } = metadata;

    const serverMetadata: client.ServerMetadata = {
      ...metadataFields,
      ...(code_challenge_methods_supported === undefined
        ? {}
        : { code_challenge_methods_supported: code_challenge_methods_supported.slice() }),
      ...(response_types_supported === undefined
        ? {}
        : { response_types_supported: response_types_supported.slice() }),
      ...(grant_types_supported === undefined
        ? {}
        : { grant_types_supported: grant_types_supported.slice() }),
      ...(id_token_signing_alg_values_supported === undefined
        ? {}
        : {
            id_token_signing_alg_values_supported: id_token_signing_alg_values_supported.slice(),
          }),
      ...(token_endpoint_auth_methods_supported === undefined
        ? {}
        : {
            token_endpoint_auth_methods_supported: token_endpoint_auth_methods_supported.slice(),
          }),
      ...(revocation_endpoint_auth_methods_supported === undefined
        ? {}
        : {
            revocation_endpoint_auth_methods_supported:
              revocation_endpoint_auth_methods_supported.slice(),
          }),
    };

    freezeOAuth(serverMetadata);
    installed.push({ provider, metadata: serverMetadata, allowedUrls });
  }

  return { installed, fetch, timeoutSeconds: options.timeoutSeconds };
});
