import * as M from "@yielded/auth/OAuth";
import {
  OAuthConnectedProtocol,
  OAuthProtocolRejected,
  OAuthUnavailable,
  OAuthCallbackId,
  OAuthCodeResponse,
  OAuthDisplayProfile,
  OAuthExternalIdentity,
  OAuthInstant,
  OAuthProtocolPreparation,
  OAuthTransactionSecrets,
  snapshotOAuth,
} from "@yielded/auth/OAuth";
import { RequestBindingFlowId } from "@yielded/auth/Operations";
import { reportAuthFailure } from "@yielded/auth/Persistence";
import { Cause, DateTime, Effect, Layer, Redacted, Schema } from "effect";
import * as client from "openid-client";

import {
  DefiniteTokenRejection,
  type ConnectedCompatibility,
  type ConnectedOptions,
} from "../compatibility";
import { clientAuthentication } from "../configuration";
import { type OpenIdClientConfigurationError } from "../models";
import { decodeOidcProfile } from "../profile";
import { ProviderRevocation } from "../ProviderRevocation";
import { boundedFetch } from "../transport";
import {
  installConnectedConfigurations,
  sameConnectedProfile,
  type InstalledConnectedProvider,
} from "./configuration";
import type { OpenIdClientConnectedProtocolOptions } from "./models";

const unavailable = () => OAuthUnavailable.make({});
const rejected = () => OAuthProtocolRejected.make({});

const safe = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.tapCause((cause) =>
      Cause.hasDies(cause) ? reportAuthFailure("oauth-protocol", cause) : Effect.void,
    ),
    Effect.catchCause((cause): Effect.Effect<never, E | OAuthUnavailable> => {
      if (Cause.hasInterrupts(cause)) return Effect.interrupt;

      return Cause.hasDies(cause) ? Effect.fail(unavailable()) : Effect.failCause(cause);
    }),
  );

/** After possible transmission, validation/transport failures remain ambiguous. */
const grantError = (error: unknown) =>
  error instanceof DefiniteTokenRejection ||
  (error instanceof client.ClientError && error.cause instanceof DefiniteTokenRejection) ||
  (error instanceof client.ResponseBodyError &&
    error.status === 400 &&
    error.error === "invalid_grant")
    ? rejected()
    : unavailable();

const prepareInput = Schema.Struct({
  profile: M.OAuthConnectedProfile,
  callbackId: OAuthCallbackId,
  flowId: RequestBindingFlowId,
});

const prepareOutput = Schema.Struct({
  ...OAuthProtocolPreparation.fields,
  configuration: M.OAuthConnectedConfiguration,
});

const exchangeInput = Schema.toType(
  Schema.Struct({
    configuration: M.OAuthConnectedConfiguration,
    secrets: OAuthTransactionSecrets,
    response: OAuthCodeResponse,
    verificationStartedAt: Schema.DateTimeUtcFromMillis,
  }),
);

const refreshInput = Schema.toType(
  Schema.Struct({
    context: M.OAuthConnectedTokenContext,
    material: M.OAuthConnectedTokenMaterial,
    verificationStartedAt: Schema.DateTimeUtcFromMillis,
  }),
);

const revokeInput = Schema.Struct({
  context: M.OAuthConnectedTokenContext,
  material: M.OAuthConnectedTokenMaterial,
});

const numericDate = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 8640000000000 }));

const claimsSchema = Schema.Struct({
  iss: Schema.String,
  sub: OAuthExternalIdentity.fields.subject,
  aud: Schema.Union([
    Schema.String,
    Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(1)),
  ]),
  azp: Schema.optionalKey(Schema.String),
  exp: numericDate,
  iat: numericDate,
  nbf: Schema.optionalKey(numericDate),
  auth_time: Schema.optionalKey(numericDate),
  nonce: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
});

const identitySchema = Schema.Struct({
  subject: OAuthExternalIdentity.fields.subject,
  profile: Schema.optionalKey(OAuthDisplayProfile),
});

const rawMetadataSchema = Schema.Struct({
  expires_in: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
  scope: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(16447))),
});

const rawRefreshExpiry = Schema.UndefinedOr(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)));

interface GrantMetadata {
  readonly expiresIn?: number;
  readonly scope?: string;
  readonly refreshExpiresIn?: number;
}

const privateConfiguration = <R>(
  entry: InstalledConnectedProvider<R>,
  fetch: client.CustomFetch,
  timeout: number,
  signal: AbortSignal,
  purpose: "grant" | "revoke",
  compatibility?: ConnectedCompatibility,
  receipt?: Parameters<ConnectedCompatibility["inspectReceipt"]>[1],
) => {
  const provider = entry.provider;

  const authentication =
    purpose === "revoke" && provider.revocation.mode === "rfc7009"
      ? provider.revocation.authentication
      : provider.authentication;

  const configuration = new client.Configuration(
    entry.metadata,
    provider.clientId,
    {
      [client.clockSkew]: 0,
      [client.clockTolerance]: 0,
      ...(provider.protocol === "oidc" ? { id_token_signed_response_alg: "RS256" } : {}),
    },
    clientAuthentication(authentication),
  );

  const transport = boundedFetch(fetch, signal, entry.allowedUrls);
  let metadata: GrantMetadata | undefined;

  configuration.timeout = timeout;
  configuration[client.customFetch] = async (url, options) => {
    const response = await transport(url, options);

    if (
      purpose === "grant" &&
      url === new URL(entry.metadata.token_endpoint!).href &&
      (compatibility !== undefined || response.status === 200)
    ) {
      const body: unknown = await response.clone().json();

      signal.throwIfAborted();
      if (compatibility !== undefined) {
        if (!receipt) throw unavailable();
        compatibility.inspectReceipt(
          { body, status: response.status, contentType: response.headers.get("content-type") },
          receipt,
        );
        signal.throwIfAborted();
      }
      if (response.status !== 200) return response;
      if (metadata !== undefined) throw unavailable();
      // oxlint-disable-next-line no-restricted-properties -- Capture bounded raw expiry values before the maintained parser's coercion.
      const decoded = Schema.decodeUnknownSync(rawMetadataSchema)(body);
      let refreshExpiresIn: number | undefined;

      if (provider.refreshExpiry !== "unreported") {
        // oxlint-disable-next-line no-restricted-properties -- The extension name and numeric semantics are explicitly installed.
        refreshExpiresIn = Schema.decodeUnknownSync(rawRefreshExpiry)(
          Reflect.get(body as object, provider.refreshExpiry.field),
        );
        if (refreshExpiresIn === 0 && provider.refreshExpiry.zero === "unreported")
          refreshExpiresIn = undefined;
      }
      metadata = {
        ...(decoded.expires_in === undefined ? {} : { expiresIn: decoded.expires_in }),
        ...(decoded.scope === undefined ? {} : { scope: decoded.scope }),
        ...(refreshExpiresIn === undefined ? {} : { refreshExpiresIn }),
      };
    }

    return response;
  };
  if (provider.protocol === "oidc") client.enableNonRepudiationChecks(configuration);

  return {
    configuration,
    metadata: () => {
      if (!metadata) throw unavailable();

      return metadata;
    },
  };
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

const appendResources = (parameters: URLSearchParams, resources: ReadonlyArray<string>) => {
  for (const resource of resources) parameters.append("resource", resource);
};

const sameStrings = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length &&
  [...left].sort().every((value, index) => value === [...right].sort()[index]);

export const makeConnectedProtocolWithCompatibility = Effect.fn(
  "makeOpenIdClientConnectedProtocol",
)(function* <R = never>(
  options: ConnectedOptions<R>,
  compatibility?: ConnectedCompatibility,
): Effect.fn.Return<
  OAuthConnectedProtocol["Service"],
  OpenIdClientConfigurationError | OAuthUnavailable,
  R | ProviderRevocation
> {
  const decoderContext = yield* Effect.context<R>();
  const providerRevocation = yield* ProviderRevocation;

  const { installed, fetch, timeoutSeconds } = yield* installConnectedConfigurations(
    options,
    compatibility !== undefined,
  );

  const retained = Effect.fn("OpenIdClientConnected.retained")(function* (
    saved: M.OAuthConnectedConfiguration,
  ) {
    const entry = installed.find(
      ({ provider }) =>
        provider.provider === saved.provider &&
        provider.configurationGeneration === saved.configurationGeneration,
    );

    const provider = entry?.provider;

    if (
      !entry ||
      !provider ||
      provider.protocol !== saved.protocol ||
      provider.issuer !== saved.issuer ||
      provider.responseIssuerMode !== saved.responseIssuerMode ||
      provider.clientRegistrationId !== saved.profile.clientRegistrationId ||
      !provider.profiles.some((profile) => sameConnectedProfile(profile, saved.profile)) ||
      provider.callbacks.find((callback) => callback.callbackId === saved.callbackId)
        ?.redirectUri !== saved.redirectUri
    )
      return yield* unavailable();

    return entry;
  });

  const checkedStart = Effect.fn("OpenIdClientConnected.startedAt")(function* (
    start: DateTime.Utc,
  ) {
    const value = DateTime.toEpochMillis(start);

    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > DateTime.toEpochMillis(yield* DateTime.now)
    )
      return yield* unavailable();

    return value;
  });

  const tokenMetadata = Effect.fn("OpenIdClientConnected.tokenMetadata")(function* (
    profile: M.OAuthConnectedProfile,
    metadata: GrantMetadata,
    start: number,
    refreshRetained: boolean,
  ) {
    const scopes =
      compatibility !== undefined
        ? yield* Effect.try({
            try: () => compatibility.decodeScopes(metadata.scope, profile.scopes),
            catch: unavailable,
          })
        : metadata.scope === undefined
          ? profile.scopes
          : yield* Schema.decodeEffect(M.OAuthConnectedScopes)(metadata.scope.split(" ")).pipe(
              Effect.mapError(unavailable),
            );

    if (new Set(scopes).size !== scopes.length || !sameStrings(scopes, profile.scopes))
      return yield* unavailable();

    const accessExpiresAtMillis =
      metadata.expiresIn === undefined
        ? undefined
        : yield* Schema.decodeEffect(OAuthInstant)(
            Math.floor(start + metadata.expiresIn * 1000),
          ).pipe(Effect.mapError(unavailable));

    const refreshExpiresAtMillis =
      !refreshRetained || metadata.refreshExpiresIn === undefined
        ? undefined
        : yield* Schema.decodeEffect(OAuthInstant)(
            Math.floor(start + metadata.refreshExpiresIn * 1000),
          ).pipe(Effect.mapError(unavailable));

    const now = DateTime.toEpochMillis(yield* DateTime.now);

    if (
      (accessExpiresAtMillis !== undefined && accessExpiresAtMillis <= now) ||
      (refreshExpiresAtMillis !== undefined && refreshExpiresAtMillis <= now)
    )
      return yield* unavailable();

    return {
      scopes: [...scopes],
      resources: [...profile.resources],
      ...(accessExpiresAtMillis === undefined ? {} : { accessExpiresAtMillis }),
      ...(refreshExpiresAtMillis === undefined ? {} : { refreshExpiresAtMillis }),
    };
  });

  const oidcIdentity = Effect.fn("OpenIdClientConnected.oidcIdentity")(function* (
    entry: InstalledConnectedProvider<R>,
    raw: unknown,
    originalNonce: Redacted.Redacted<string>,
    previous?: {
      readonly identity: typeof OAuthExternalIdentity.Type;
      readonly continuation: Extract<
        M.OAuthConnectedTokenMaterial["continuation"],
        { readonly _tag: "Oidc" }
      >;
    },
  ) {
    const provider = entry.provider;

    if (provider.protocol !== "oidc") return yield* unavailable();

    // oxlint-disable-next-line no-restricted-properties -- Project authenticated foreign ID-token claims into this narrower profile.
    const claims = yield* Schema.decodeUnknownEffect(claimsSchema)(raw).pipe(
      Effect.mapError(unavailable),
    );

    const now = DateTime.toEpochMillis(yield* DateTime.now) / 1000;
    const audience = typeof claims.aud === "string" ? claims.aud : claims.aud[0];

    if (
      claims.iss !== provider.issuer ||
      audience !== provider.clientId ||
      (claims.azp !== undefined && claims.azp !== provider.clientId) ||
      claims.exp <= now ||
      claims.iat > now ||
      (claims.nbf !== undefined && claims.nbf > now) ||
      (claims.auth_time !== undefined && claims.auth_time > now) ||
      (previous
        ? claims.sub !== previous.identity.subject ||
          (claims.nonce !== undefined && claims.nonce !== Redacted.value(originalNonce)) ||
          (claims.auth_time !== undefined && claims.auth_time !== previous.continuation.authTime)
        : claims.nonce !== Redacted.value(originalNonce) ||
          (provider.maxAgeSeconds !== undefined &&
            (claims.auth_time === undefined ||
              claims.auth_time + provider.maxAgeSeconds < Math.floor(now))))
    )
      return yield* unavailable();

    const profile = yield* decodeOidcProfile(raw, provider.issuer).pipe(
      Effect.mapError(unavailable),
    );

    return {
      identity: { provider: provider.provider, issuer: provider.issuer, subject: claims.sub },
      ...(profile === undefined ? {} : { profile }),
      continuation: previous?.continuation ?? {
        _tag: "Oidc" as const,
        clientId: provider.clientId,
        nonce: Redacted.make(Redacted.value(originalNonce)),
        ...(claims.auth_time === undefined ? {} : { authTime: claims.auth_time }),
      },
    };
  });

  const decodeIdentity = Effect.fn("OpenIdClientConnected.decodeIdentity")(function* (
    entry: InstalledConnectedProvider<R>,
    body: unknown,
  ) {
    if (entry.provider.protocol !== "oauth") return yield* unavailable();
    const decoder = entry.provider.identitySource.decodeIdentity;

    const result = yield* Effect.suspend(() => decoder(body)).pipe(
      Effect.provideContext(decoderContext),
      Effect.catchCause((cause) => {
        const recovered = Cause.hasInterrupts(cause)
          ? Effect.interrupt
          : Effect.fail(unavailable());

        if (
          cause.reasons.length === 1 &&
          cause.reasons[0]?._tag === "Fail" &&
          Schema.is(OAuthProtocolRejected)(cause.reasons[0].error)
        )
          return recovered;

        return reportAuthFailure("oauth-identity", cause).pipe(Effect.andThen(recovered));
      }),
    );

    const value = yield* Schema.decodeEffect(identitySchema)(result).pipe(
      Effect.mapError(unavailable),
    );

    return {
      identity: {
        provider: entry.provider.provider,
        issuer: entry.provider.issuer,
        subject: value.subject,
      },
      ...(value.profile === undefined ? {} : { profile: value.profile }),
      continuation: { _tag: "OAuth" as const },
    };
  });

  const prepareAuthorization: OAuthConnectedProtocol["Service"]["prepareAuthorization"] = Effect.fn(
    "OpenIdClientConnected.prepareAuthorization",
  )(function* (input) {
    const request = yield* snapshotOAuth(prepareInput, input);

    const entry = installed.find(
      ({ provider }) =>
        provider.provider === request.profile.provider &&
        provider.issuance === "active" &&
        provider.profiles.some(
          (profile) =>
            profile.issuance === "active" && sameConnectedProfile(profile, request.profile),
        ),
    );

    const callback = entry?.provider.callbacks.find(
      (value) => value.callbackId === request.callbackId,
    );

    if (!entry || !callback || request.profile.issuance !== "active") return yield* rejected();

    const result = yield* Effect.tryPromise({
      try: async (signal) => {
        const { configuration } = privateConfiguration(
          entry,
          fetch,
          timeoutSeconds,
          signal,
          "grant",
        );

        const publishJwks = bindJwks(entry.provider, configuration);

        try {
          const state = client.randomState(),
            verifier = client.randomPKCECodeVerifier(),
            nonce = entry.provider.protocol === "oidc" ? client.randomNonce() : undefined;

          const challenge = await client.calculatePKCECodeChallenge(verifier);

          signal.throwIfAborted();
          const parameters = new URLSearchParams(entry.provider.authorizationParameters);

          for (const [key, value] of Object.entries({
            response_type: "code",
            response_mode: "query",
            redirect_uri: callback.redirectUri,
            scope: (
              compatibility?.authorizationScopes(
                request.profile.scopes,
                request.profile.retention === "access-and-refresh",
              ) ?? request.profile.scopes
            ).join(" "),
            state,
            code_challenge: challenge,
            code_challenge_method: "S256",
          }))
            parameters.set(key, value);
          if (nonce !== undefined) parameters.set("nonce", nonce);
          if (entry.provider.protocol === "oidc" && entry.provider.maxAgeSeconds !== undefined)
            parameters.set("max_age", String(entry.provider.maxAgeSeconds));
          appendResources(parameters, request.profile.resources);

          return {
            configuration: {
              provider: entry.provider.provider,
              protocol: entry.provider.protocol,
              configurationGeneration: entry.provider.configurationGeneration,
              issuer: entry.provider.issuer,
              responseIssuerMode: entry.provider.responseIssuerMode,
              callbackId: callback.callbackId,
              redirectUri: callback.redirectUri,
              profile: request.profile,
            },
            authorizationUrl: Redacted.make(
              client.buildAuthorizationUrl(configuration, parameters).href,
            ),
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

    return yield* snapshotOAuth(prepareOutput, result);
  });

  const exchangeGrant: OAuthConnectedProtocol["Service"]["exchangeGrant"] = Effect.fn(
    "OpenIdClientConnected.exchangeGrant",
  )(function* (input) {
    const request = yield* snapshotOAuth(exchangeInput, input),
      saved = request.configuration;

    const entry = yield* retained(saved),
      provider = entry.provider;

    if (
      (provider.protocol === "oidc") !== (request.secrets.oidcNonce !== undefined) ||
      Redacted.value(request.response.state) !== Redacted.value(request.secrets.state) ||
      (provider.responseIssuerMode === "required"
        ? request.response.issuer !== provider.issuer
        : request.response.issuer !== undefined)
    )
      return yield* rejected();
    const start = yield* checkedStart(request.verificationStartedAt);

    const result = yield* Effect.tryPromise({
      try: async (signal) => {
        const invocation = privateConfiguration(
          entry,
          fetch,
          timeoutSeconds,
          signal,
          "grant",
          compatibility,
          {
            scopes: saved.profile.scopes,
            refreshRequired: saved.profile.retention === "access-and-refresh",
            operation: "authorization_code",
          },
        );

        const publishJwks = bindJwks(provider, invocation.configuration);

        try {
          const url = new URL(saved.redirectUri);

          url.searchParams.set("code", Redacted.value(request.response.code));
          url.searchParams.set("state", Redacted.value(request.response.state));
          if (request.response.issuer !== undefined)
            url.searchParams.set("iss", request.response.issuer);
          const parameters = new URLSearchParams(provider.tokenParameters);

          appendResources(parameters, saved.profile.resources);

          const tokens = await client.authorizationCodeGrant(
            invocation.configuration,
            url,
            {
              expectedState: Redacted.value(request.secrets.state),
              pkceCodeVerifier: Redacted.value(request.secrets.pkceVerifier),
              ...(provider.protocol === "oidc"
                ? {
                    idTokenExpected: true,
                    expectedNonce: Redacted.value(request.secrets.oidcNonce!),
                    ...(provider.maxAgeSeconds === undefined
                      ? {}
                      : { maxAge: provider.maxAgeSeconds }),
                  }
                : {}),
            },
            parameters,
          );

          signal.throwIfAborted();
          if (tokens.token_type !== "bearer") throw unavailable();
          const metadata = invocation.metadata();
          let body: unknown;

          if (provider.protocol === "oauth") {
            const response = await client.fetchProtectedResource(
              invocation.configuration,
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
            body = await response.json();
            signal.throwIfAborted();
          }

          return {
            tokens,
            metadata,
            body,
          };
        } finally {
          publishJwks();
        }
      },
      catch: grantError,
    });

    const identity =
      provider.protocol === "oidc"
        ? yield* oidcIdentity(entry, result.tokens.claims(), request.secrets.oidcNonce!)
        : yield* decodeIdentity(entry, result.body);

    const refreshToken =
      saved.profile.retention === "access-and-refresh" ? result.tokens.refresh_token : undefined;

    const metadata = yield* tokenMetadata(
      saved.profile,
      result.metadata,
      start,
      refreshToken !== undefined,
    );

    return yield* snapshotOAuth(M.OAuthConnectedGrantResponse, {
      ...identity,
      ...metadata,
      material: {
        namespace: "effect-auth/oauth-connected-token-material/v1",
        accessToken: Redacted.make(result.tokens.access_token),
        ...(refreshToken === undefined ? {} : { refreshToken: Redacted.make(refreshToken) }),
        continuation: identity.continuation,
      },
    });
  });

  const refreshGrant: OAuthConnectedProtocol["Service"]["refreshGrant"] = Effect.fn(
    "OpenIdClientConnected.refreshGrant",
  )(function* (input) {
    const request = yield* snapshotOAuth(refreshInput, input),
      saved = request.context.configuration;

    const entry = yield* retained(saved),
      provider = entry.provider,
      previous = request.material.continuation;

    if (
      saved.profile.retention !== "access-and-refresh" ||
      saved.profile.refresh === "unsupported" ||
      !request.material.refreshToken ||
      request.context.identity.provider !== provider.provider ||
      request.context.identity.issuer !== provider.issuer ||
      (provider.protocol === "oidc"
        ? previous._tag !== "Oidc" ||
          previous.clientId !== provider.clientId ||
          previous.nonce === undefined
        : previous._tag !== "OAuth") ||
      !sameStrings(request.context.metadata.scopes, saved.profile.scopes) ||
      !sameStrings(request.context.metadata.resources, saved.profile.resources)
    )
      return yield* unavailable();
    const start = yield* checkedStart(request.verificationStartedAt);

    if (
      (request.context.metadata.refreshUseUntilMillis !== undefined &&
        request.context.metadata.refreshUseUntilMillis <= start) ||
      (request.context.metadata.refreshExpiresAtMillis !== undefined &&
        request.context.metadata.refreshExpiresAtMillis <= start)
    )
      return yield* unavailable();

    const result = yield* Effect.tryPromise({
      try: async (signal) => {
        const invocation = privateConfiguration(
          entry,
          fetch,
          timeoutSeconds,
          signal,
          "grant",
          compatibility,
          {
            scopes: saved.profile.scopes,
            refreshRequired: true,
            operation: "refresh_token",
          },
        );

        const publishJwks = bindJwks(provider, invocation.configuration);

        try {
          const parameters = new URLSearchParams(provider.refreshParameters);

          if (compatibility?.includeRefreshScope !== false)
            parameters.set("scope", saved.profile.scopes.join(" "));
          appendResources(parameters, saved.profile.resources);

          const tokens = await client.refreshTokenGrant(
            invocation.configuration,
            Redacted.value(request.material.refreshToken!),
            parameters,
          );

          signal.throwIfAborted();
          if (
            tokens.token_type !== "bearer" ||
            (saved.profile.refresh === "rotating" &&
              (!tokens.refresh_token ||
                tokens.refresh_token === Redacted.value(request.material.refreshToken!)))
          )
            throw unavailable();
          const metadata = invocation.metadata();
          let body: unknown;

          if (provider.protocol === "oauth") {
            const response = await client.fetchProtectedResource(
              invocation.configuration,
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
            body = await response.json();
            signal.throwIfAborted();
          }

          return {
            tokens,
            metadata,
            body,
          };
        } finally {
          publishJwks();
        }
      },
      catch: grantError,
    });

    if (provider.protocol === "oidc") {
      if (previous._tag !== "Oidc" || !previous.nonce) return yield* unavailable();
      if (result.tokens.id_token !== undefined)
        yield* oidcIdentity(entry, result.tokens.claims(), previous.nonce, {
          identity: request.context.identity,
          continuation: previous,
        });
    } else {
      const identity = yield* decodeIdentity(entry, result.body);

      if (identity.identity.subject !== request.context.identity.subject)
        return yield* unavailable();
    }
    const metadata = yield* tokenMetadata(saved.profile, result.metadata, start, true);
    const finishedAt = DateTime.toEpochMillis(yield* DateTime.now);

    if (
      (request.context.metadata.refreshUseUntilMillis !== undefined &&
        request.context.metadata.refreshUseUntilMillis <= finishedAt) ||
      (request.context.metadata.refreshExpiresAtMillis !== undefined &&
        request.context.metadata.refreshExpiresAtMillis <= finishedAt)
    )
      return yield* unavailable();

    return yield* snapshotOAuth(M.OAuthConnectedGrantResponse, {
      identity: request.context.identity,
      ...metadata,
      material: {
        namespace: "effect-auth/oauth-connected-token-material/v1",
        accessToken: Redacted.make(result.tokens.access_token),
        ...(result.tokens.refresh_token === undefined
          ? {}
          : { refreshToken: Redacted.make(result.tokens.refresh_token) }),
        continuation: previous,
      },
    });
  });

  const revokeGrant: OAuthConnectedProtocol["Service"]["revokeGrant"] = Effect.fn(
    "OpenIdClientConnected.revokeGrant",
  )(function* (input) {
    const request = yield* snapshotOAuth(revokeInput, input),
      saved = request.context.configuration;

    const entry = yield* retained(saved),
      revocation = entry.provider.revocation;

    if (
      saved.profile.revocation !== "cohort" ||
      revocation.mode === "unsupported" ||
      (revocation.mode === "provider-cohort" && compatibility === undefined) ||
      (revocation.mode === "rfc7009" &&
        request.material.refreshToken !== undefined &&
        revocation.tokenTypes !== "access-and-refresh") ||
      request.context.identity.provider !== entry.provider.provider ||
      request.context.identity.issuer !== entry.provider.issuer ||
      (entry.provider.protocol === "oidc"
        ? request.material.continuation._tag !== "Oidc" ||
          request.material.continuation.clientId !== entry.provider.clientId
        : request.material.continuation._tag !== "OAuth")
    )
      return yield* unavailable();
    if (revocation.mode === "provider-cohort") {
      yield* providerRevocation.revoke({
        clientId: entry.provider.clientId,
        authentication: entry.provider.authentication,
        context: request.context,
        material: request.material,
      });

      return "Confirmed" as const;
    }
    yield* Effect.tryPromise({
      try: async (signal) => {
        const { configuration } = privateConfiguration(
          entry,
          fetch,
          timeoutSeconds,
          signal,
          "revoke",
        );

        const publishJwks = bindJwks(entry.provider, configuration);

        try {
          if (request.material.refreshToken !== undefined) {
            await client.tokenRevocation(
              configuration,
              Redacted.value(request.material.refreshToken),
              { token_type_hint: "refresh_token" },
            );
            signal.throwIfAborted();
          }
          await client.tokenRevocation(
            configuration,
            Redacted.value(request.material.accessToken),
            {
              token_type_hint: "access_token",
            },
          );
          signal.throwIfAborted();
        } finally {
          publishJwks();
        }
      },
      catch: unavailable,
    });

    return "Confirmed" as const;
  });

  return OAuthConnectedProtocol.of({
    prepareAuthorization: (input) => safe(prepareAuthorization(input)),
    exchangeGrant: (input) => safe(exchangeGrant(input)),
    refreshGrant: (input) => safe(refreshGrant(input)),
    revokeGrant: (input) => safe(revokeGrant(input)),
  });
}, safe);

export const makeOpenIdClientConnectedProtocol = <R = never>(
  options: OpenIdClientConnectedProtocolOptions<R>,
): Effect.Effect<
  OAuthConnectedProtocol["Service"],
  OpenIdClientConfigurationError | OAuthUnavailable,
  R
> =>
  makeConnectedProtocolWithCompatibility(options).pipe(
    Effect.provide(ProviderRevocation.layerUnsupported),
  );

export const openIdClientConnectedProtocolLayer = <R = never>(
  options: OpenIdClientConnectedProtocolOptions<R>,
) => Layer.effect(OAuthConnectedProtocol, makeOpenIdClientConnectedProtocol(options));
