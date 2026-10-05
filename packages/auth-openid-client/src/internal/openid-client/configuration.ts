import {
  OAuthProviderKey,
  OAuthUnavailable,
  OAuthAuthorizationUrl,
  OAuthCallbackId,
  OAuthGeneration,
  OAuthIssuer,
  OAuthRedirectUri,
  freezeOAuth,
} from "@yielded/auth/OAuth";
import { Effect, Predicate, Redacted, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import * as client from "openid-client";

import { TokenCompatibility, tokenCompatibility } from "./compatibility";
import {
  OpenIdClientConfigurationError,
  type OpenIdClientAuthentication,
  type OpenIdClientOAuthProvider,
  type OpenIdClientOAuthProtocolOptions,
  type OpenIdClientOidcProvider,
} from "./models";
import { boundedFetch } from "./transport";

const boundedString = (maximum: number) =>
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(maximum));

const fields = Schema.Record(
  Schema.String.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9._~-]{0,63}$/)),
  Schema.String.check(Schema.isMaxLength(2048)),
).check(Schema.makeFilter((record) => Object.keys(record).length <= 16));

const secret = Schema.RedactedFromValue(boundedString(4096));

export const authentication = Schema.Union([
  Schema.Struct({ method: Schema.Literal("client_secret_basic"), secret }),
  Schema.Struct({ method: Schema.Literal("client_secret_post"), secret }),
  Schema.Struct({ method: Schema.Literal("none"), publicClient: Schema.Literal(true) }),
]);

const common = {
  provider: OAuthProviderKey,
  configurationGeneration: OAuthGeneration,
  issuance: Schema.Literals(["active", "retired"]),
  issuer: OAuthIssuer,
  responseIssuerMode: Schema.Literals(["required", "unsupported"]),
  clientId: boundedString(1024),
  authentication,
  callbacks: Schema.Array(
    Schema.Struct({ callbackId: OAuthCallbackId, redirectUri: OAuthRedirectUri }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
  scopes: Schema.Array(
    Schema.String.check(Schema.isPattern(/^[\x21\x23-\x5b\x5d-\x7e]{1,128}$/)),
  ).check(Schema.isMaxLength(32)),
  authorizationParameters: Schema.optionalKey(fields),
  tokenParameters: Schema.optionalKey(fields),
};

const optionsSchema = <R>() =>
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
            protocol: Schema.Literal("oauth"),
            [tokenCompatibility]: Schema.optionalKey(TokenCompatibility),
            authorizationEndpoint: boundedString(2048),
            tokenEndpoint: boundedString(2048),
            pkceS256: Schema.Literal(true),
            identitySource: Schema.Struct({
              url: boundedString(2048),
              headers: Schema.optionalKey(fields),
              // A configured function is trusted application code; its result has a separate schema boundary.
              decodeIdentity: Schema.declare<
                OpenIdClientOAuthProvider<R>["identitySource"]["decodeIdentity"]
              >(
                (
                  input,
                ): input is OpenIdClientOAuthProvider<R>["identitySource"]["decodeIdentity"] =>
                  Predicate.isFunction(input),
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
  "iss",
  "grant_type",
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

const configError = (reason: OpenIdClientConfigurationError["reason"]) =>
  OpenIdClientConfigurationError.make({ reason });

const protocolUrl = (value: string, allowLoopback: boolean): URL => {
  const url = new URL(value);

  if (
    (url.protocol !== "https:" &&
      !(
        allowLoopback &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username !== "" ||
    url.password !== "" ||
    value.includes("#") ||
    // oxlint-disable-next-line no-control-regex -- Reject ambiguous protocol URL control characters.
    /[\s\\\u0000-\u001f\u007f]/u.test(value)
  )
    throw configError("metadata");

  return url;
};

/** Provider endpoints always require HTTPS. */
export const endpoint = (value: string): URL => protocolUrl(value, false);

/** Local development callbacks may use HTTP on an exact loopback host. */
export const callbackEndpoint = (value: string): URL => protocolUrl(value, true);

const checkParameters = (parameters: Readonly<Record<string, string>> | undefined) => {
  for (const key of Object.keys(parameters ?? {})) {
    if (reserved.has(key.toLowerCase())) throw configError("parameters");
  }
};

export const clientAuthentication = (
  authentication: OpenIdClientAuthentication,
): client.ClientAuth => {
  switch (authentication.method) {
    case "client_secret_basic":
      return client.ClientSecretBasic(Redacted.value(authentication.secret));
    case "client_secret_post":
      return client.ClientSecretPost(Redacted.value(authentication.secret));
    case "none":
      return client.None();
  }
};

export type Provider<R> = OpenIdClientOidcProvider | OpenIdClientOAuthProvider<R>;

export interface InstalledProvider<R> {
  readonly provider: Provider<R>;
  readonly metadata: client.ServerMetadata;
  readonly allowedUrls: ReadonlySet<string>;
}

export const makeAuthorizationParameters = (
  configuration: {
    readonly protocol: "oauth" | "oidc";
    readonly authorizationParameters?: Readonly<Record<string, string>>;
    readonly scopes: ReadonlyArray<string>;
    readonly maxAgeSeconds?: number;
  },
  redirectUri: string,
  generated: { readonly state: string; readonly challenge: string; readonly nonce?: string },
): Record<string, string> => ({
  ...configuration.authorizationParameters,
  response_type: "code",
  response_mode: "query",
  redirect_uri: redirectUri,
  scope: configuration.scopes.join(" "),
  state: generated.state,
  code_challenge: generated.challenge,
  code_challenge_method: "S256",
  ...(generated.nonce === undefined ? {} : { nonce: generated.nonce }),
  ...(configuration.protocol === "oidc" && configuration.maxAgeSeconds !== undefined
    ? { max_age: String(configuration.maxAgeSeconds) }
    : {}),
});

const metadataSchema = Schema.Struct({
  issuer: OAuthIssuer,
  authorization_endpoint: boundedString(2048),
  token_endpoint: boundedString(2048),
  jwks_uri: Schema.optionalKey(boundedString(2048)),
  code_challenge_methods_supported: Schema.optionalKey(Schema.Array(boundedString(64))),
  response_types_supported: Schema.optionalKey(Schema.Array(boundedString(64))),
  id_token_signing_alg_values_supported: Schema.optionalKey(Schema.Array(boundedString(64))),
  token_endpoint_auth_methods_supported: Schema.optionalKey(Schema.Array(boundedString(64))),
  authorization_response_iss_parameter_supported: Schema.optionalKey(Schema.Boolean),
});

export const installConfigurations = Effect.fn("OpenIdClient.installConfigurations")(function* <R>(
  input: OpenIdClientOAuthProtocolOptions<R>,
) {
  const options = yield* Schema.decodeEffect(optionsSchema<R>())(input).pipe(
    Effect.mapError(() => configError("provider")),
  );

  // Detach secrets as well as arrays and records before retaining configuration.
  const providers = options.providers.map((provider): Provider<R> => {
    const detached = {
      callbacks: provider.callbacks.map((callback) => ({ ...callback })),
      scopes: [...provider.scopes],
      ...(provider.authorizationParameters === undefined
        ? {}
        : { authorizationParameters: { ...provider.authorizationParameters } }),
      ...(provider.tokenParameters === undefined
        ? {}
        : { tokenParameters: { ...provider.tokenParameters } }),
      authentication:
        provider.authentication.method === "none"
          ? { ...provider.authentication }
          : {
              ...provider.authentication,
              secret: Redacted.make(Redacted.value(provider.authentication.secret)),
            },
    };

    return provider.protocol === "oidc"
      ? { ...provider, ...detached }
      : {
          ...provider,
          ...detached,
          identitySource: {
            ...provider.identitySource,
            ...(provider.identitySource.headers === undefined
              ? {}
              : { headers: { ...provider.identitySource.headers } }),
          },
        };
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
      const generations = new Set<string>();
      const active = new Set<string>();
      const names = new Set<string>();

      for (const provider of providers) {
        const generation = `${provider.provider.length}:${provider.provider}:${provider.configurationGeneration}`;

        if (generations.has(generation)) throw configError("generation");
        generations.add(generation);
        names.add(provider.provider);
        if (provider.issuance === "active") {
          if (active.has(provider.provider)) throw configError("generation");
          active.add(provider.provider);
        }
        const issuer = endpoint(provider.issuer);

        if (provider.issuer.includes("?") || issuer.pathname.includes("/.well-known/"))
          throw configError("issuer");
        if (new Set(provider.scopes).size !== provider.scopes.length)
          throw configError("parameters");
        if ((provider.protocol === "oidc") !== provider.scopes.includes("openid"))
          throw configError("parameters");
        checkParameters(provider.authorizationParameters);
        checkParameters(provider.tokenParameters);
        const callbacks = new Set<string>();

        for (const callback of provider.callbacks) {
          const url = callbackEndpoint(callback.redirectUri);

          if (
            url.href !== callback.redirectUri ||
            callback.redirectUri.includes("?") ||
            callbacks.has(callback.callbackId)
          )
            throw configError("callback");
          callbacks.add(callback.callbackId);
          for (const other of providers) {
            if (provider.issuer === other.issuer) continue;
            if (
              provider.responseIssuerMode === "required" &&
              other.responseIssuerMode === "required"
            )
              continue;
            if (other.callbacks.some((candidate) => candidate.redirectUri === callback.redirectUri))
              throw configError("callback");
          }
        }
        if (provider.protocol === "oauth") {
          endpoint(provider.identitySource.url);
          for (const key of Object.keys(provider.identitySource.headers ?? {})) {
            if (forbiddenHeaders.has(key.toLowerCase())) throw configError("identity-source");
          }
          new Headers(provider.identitySource.headers);
        }
        freezeOAuth(provider);
      }
      if (active.size !== names.size) throw configError("generation");
    },
    catch: (error) =>
      Schema.is(OpenIdClientConfigurationError)(error) ? error : configError("provider"),
  });
  const installed: InstalledProvider<R>[] = [];

  for (const provider of providers) {
    let raw: client.ServerMetadata;

    if (provider.protocol === "oidc") {
      const discoveryUrl = new URL(provider.issuer);

      discoveryUrl.pathname = `${discoveryUrl.pathname.replace(/\/$/u, "")}/.well-known/openid-configuration`;

      const configuration = yield* Effect.tryPromise({
        try: (signal) =>
          client.discovery(
            new URL(provider.issuer),
            provider.clientId,
            {
              id_token_signed_response_alg: provider.idTokenSignedResponseAlg,
              [client.clockSkew]: 0,
              [client.clockTolerance]: 0,
            },
            clientAuthentication(provider.authentication),
            {
              timeout: options.timeoutSeconds,
              execute: [client.enableNonRepudiationChecks],
              [client.customFetch]: boundedFetch(fetch, signal, new Set([discoveryUrl.href])),
            },
          ),
        catch: () => OAuthUnavailable.make({}),
      });

      raw = configuration.serverMetadata();
    } else {
      raw = {
        issuer: provider.issuer,
        authorization_endpoint: provider.authorizationEndpoint,
        token_endpoint: provider.tokenEndpoint,
        authorization_response_iss_parameter_supported: provider.responseIssuerMode === "required",
      };
    }

    // oxlint-disable-next-line no-restricted-properties -- Discovered foreign metadata is not yet validated for this adapter profile.
    const metadata = yield* Schema.decodeUnknownEffect(metadataSchema)(raw).pipe(
      Effect.mapError(() => configError("metadata")),
    );

    const allowedUrls = yield* Effect.try({
      try: () => {
        if (metadata.issuer !== provider.issuer) throw configError("issuer");
        if (
          (metadata.authorization_response_iss_parameter_supported === true) !==
          (provider.responseIssuerMode === "required")
        )
          throw configError("metadata");
        const auth = endpoint(metadata.authorization_endpoint);

        for (const key of auth.searchParams.keys()) {
          if (reserved.has(key.toLowerCase())) throw configError("parameters");
        }
        const token = endpoint(metadata.token_endpoint);

        const supportedAuthentication =
          metadata.token_endpoint_auth_methods_supported ??
          (provider.protocol === "oidc" ? ["client_secret_basic"] : undefined);

        if (
          supportedAuthentication !== undefined &&
          !supportedAuthentication.includes(provider.authentication.method)
        )
          throw configError("authentication");
        const urls = new Set([token.href]);

        if (provider.protocol === "oidc") {
          if (
            !metadata.code_challenge_methods_supported?.includes("S256") ||
            !metadata.response_types_supported?.includes("code") ||
            !metadata.id_token_signing_alg_values_supported?.includes("RS256") ||
            metadata.jwks_uri === undefined
          )
            throw configError("metadata");
          urls.add(endpoint(metadata.jwks_uri).href);
        } else {
          urls.add(endpoint(provider.identitySource.url).href);
        }
        freezeOAuth(metadata);

        return urls;
      },
      catch: (error) =>
        Schema.is(OpenIdClientConfigurationError)(error) ? error : configError("metadata"),
    });

    const {
      code_challenge_methods_supported,
      response_types_supported,
      id_token_signing_alg_values_supported,
      token_endpoint_auth_methods_supported,
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
    };

    // The SDK encodes each generated 32-byte state/challenge/nonce in 43 URL-safe characters.
    const placeholder = "a".repeat(43);

    const authorization = yield* Effect.try({
      try: () => new client.Configuration(serverMetadata, provider.clientId),
      catch: () => configError("parameters"),
    });

    for (const callback of provider.callbacks) {
      const url = yield* Effect.try({
        try: () =>
          client.buildAuthorizationUrl(
            authorization,
            makeAuthorizationParameters(provider, callback.redirectUri, {
              state: placeholder,
              challenge: placeholder,
              ...(provider.protocol === "oidc" ? { nonce: placeholder } : {}),
            }),
          ),
        catch: () => configError("parameters"),
      });

      yield* Schema.decodeEffect(OAuthAuthorizationUrl)(url.href).pipe(
        Effect.mapError(() => configError("parameters")),
      );
    }
    freezeOAuth(serverMetadata);
    installed.push({ provider, metadata: serverMetadata, allowedUrls });
  }

  return { installed, fetch, timeoutSeconds: options.timeoutSeconds };
});
