import { Crypto, DateTime, Effect, Redacted, Schema, Stream } from "effect";
import { Base64Url } from "effect/encoding";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from "effect/http";

import { selectCallback } from "./callback";
import { wipeConnectedMaterial } from "./connectedAccess";
import {
  OAuthConnectedConfiguration,
  OAuthConnectedGrantResponse,
  OAuthConnectedProfile,
  OAuthConnectedTokenMaterial,
  OAuthPermissionProfileKey,
} from "./connectedModels";
import { OAuthConnectedProtocol } from "./OAuthConnectedProtocol";
import type { ProviderDefinition } from "./providerDefinition";
import { OAuthProviderKey } from "./schema";
import { OAuthProtocolRejected, OAuthUnavailable, OAuthConfigurationError } from "./signInErrors";
import {
  OAuthCallbackId,
  OAuthIssuer,
  OAuthRedirectUri,
  OAuthTransactionSecrets,
} from "./signInModels";

export const Athlete = Schema.Struct({
  id: Schema.Int.check(Schema.isGreaterThan(0)),
  firstname: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  lastname: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  profile: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2048))),
});

const Token = Schema.Struct({
  token_type: Schema.String.check(Schema.isPattern(/^[Bb]earer$/)),
  access_token: Schema.NonEmptyString.check(Schema.isMaxLength(16384)),
  refresh_token: Schema.NonEmptyString.check(Schema.isMaxLength(16384)),
  expires_at: Schema.Int.check(Schema.isGreaterThan(0)),
  athlete: Schema.optionalKey(Athlete),
  scope: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(16384))),
});

const decodeGrant = Schema.decodeEffect(Schema.toType(OAuthConnectedGrantResponse));

// Fetch's JSON accessor buffers unknown fields too. Bound the scoped stream before decoding.
const readBody = Effect.fnUntraced(function* (response: HttpClientResponse.HttpClientResponse) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;

  const chunks = yield* response.stream.pipe(
    Stream.mapEffect((chunk) =>
      Effect.try({
        try: () => {
          size += chunk.length;
          if (size > 1_048_576) throw OAuthUnavailable.make({});

          return decoder.decode(chunk, { stream: true });
        },
        catch: () => OAuthUnavailable.make({}),
      }),
    ),
    Stream.runCollect,
    Effect.mapError(() => OAuthUnavailable.make({})),
  );

  return yield* Effect.try({
    try: () => chunks.join("") + decoder.decode(),
    catch: () => OAuthUnavailable.make({}),
  });
});

const Scopes = Schema.NonEmptyArray(
  Schema.Literals([
    "read",
    "read_all",
    "profile:read_all",
    "profile:write",
    "activity:read",
    "activity:read_all",
    "activity:write",
  ]),
);

const key = OAuthProviderKey.make("strava");
const issuer = OAuthIssuer.make("https://www.strava.com");

/** Declare permissions separately from provider secrets. */
export const accessProfile = (options: {
  readonly clientId: string;
  readonly scopes: readonly string[];
}) =>
  OAuthConnectedProfile.make({
    key: OAuthPermissionProfileKey.make("strava"),
    generation: 1,
    issuance: "active",
    provider: key,
    clientRegistrationId: options.clientId,
    scopes: options.scopes,
    resources: [],
    retention: "access-and-refresh",
    maximumAccessLifetimeMillis: 6 * 60 * 60 * 1000,
    maximumRefreshLifetimeMillis: 30 * 24 * 60 * 60 * 1000,
    refreshAheadMillis: 60_000,
    refresh: "rotating",
    revocation: "unsupported",
  });

export interface ProviderOptions {
  readonly clientId: string;
  readonly clientSecret: Redacted.Redacted<string>;
  readonly access?: OAuthConnectedProfile;
}

/** Confidential Strava authorization. The shared sign-in workflow supplies
 * single-use state/browser binding; this provider does not advertise S256 PKCE. */
const configure = Effect.fn("Strava.configure")(function* (
  options: ProviderOptions,
  profile: OAuthConnectedProfile,
  callback: {
    readonly callbackId: typeof OAuthCallbackId.Type;
    readonly redirectUri: typeof OAuthRedirectUri.Type;
  },
): Effect.fn.Return<
  OAuthConnectedProtocol["Service"],
  OAuthConfigurationError,
  HttpClient.HttpClient | Crypto.Crypto
> {
  const callbackUrl = callback.redirectUri;

  const scopes = yield* Schema.decodeUnknownEffect(Scopes)(profile.scopes).pipe(
    Effect.mapError(() => OAuthConfigurationError.make({ reason: "policy" })),
  );

  if (!/^[0-9]+$/.test(options.clientId) || Redacted.value(options.clientSecret).length === 0)
    return yield* OAuthConfigurationError.make({ reason: "policy" });

  const http = (yield* HttpClient.HttpClient).pipe(
    HttpClient.withScope,
    HttpClient.transformResponse(
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
    ),
  );

  const crypto = yield* Crypto.Crypto;

  if (profile.provider !== key || profile.clientRegistrationId !== options.clientId)
    return yield* OAuthConfigurationError.make({ reason: "policy" });

  const configuration = OAuthConnectedConfiguration.make({
    provider: key,
    protocol: "oauth",
    configurationGeneration: 1,
    issuer,
    responseIssuerMode: "unsupported",
    callbackId: callback.callbackId,
    redirectUri: OAuthRedirectUri.make(callbackUrl),
    profile,
  });

  const post = Effect.fn("Strava.token")(
    function* (parameters: Readonly<Record<string, string>>) {
      const response = yield* http.execute(
        HttpClientRequest.post("https://www.strava.com/oauth/token").pipe(
          HttpClientRequest.bodyUrlParams({
            client_id: options.clientId,
            client_secret: Redacted.value(options.clientSecret),
            ...parameters,
          }),
        ),
      );

      if (response.status === 400 || response.status === 401)
        return yield* OAuthProtocolRejected.make({});
      if (response.status !== 200) return yield* OAuthUnavailable.make({});

      return yield* readBody(response).pipe(
        Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Token))),
      );
    },
    Effect.scoped,
    (effect) =>
      effect.pipe(
        Effect.catch((error) =>
          Effect.fail(error._tag === "OAuthProtocolRejected" ? error : OAuthUnavailable.make({})),
        ),
      ),
  );

  const verifyConfiguration = (input: OAuthConnectedConfiguration) =>
    JSON.stringify(input) === JSON.stringify(configuration)
      ? Effect.void
      : Effect.fail(OAuthUnavailable.make({}));

  const material = (token: typeof Token.Type) =>
    OAuthConnectedTokenMaterial.make({
      namespace: "effect-auth/oauth-connected-token-material/v1",
      accessToken: Redacted.make(token.access_token),
      refreshToken: Redacted.make(token.refresh_token),
      continuation: { _tag: "OAuth" },
    });

  return {
    prepareAuthorization: Effect.fn("Strava.prepareAuthorization")(function* (input) {
      if (
        input.callbackId !== configuration.callbackId ||
        JSON.stringify(input.profile) !== JSON.stringify(profile)
      )
        return yield* OAuthUnavailable.make({});

      const bytes = yield* crypto
        .randomBytes(32)
        .pipe(Effect.mapError(() => OAuthUnavailable.make({})));

      const state = Base64Url.encode(bytes);

      bytes.fill(0);
      const url = new URL("https://www.strava.com/oauth/authorize");

      url.searchParams.set("client_id", options.clientId);
      url.searchParams.set("redirect_uri", callbackUrl);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("approval_prompt", "auto");
      url.searchParams.set("scope", scopes.join(","));
      url.searchParams.set("state", state);

      // The shared envelope has a verifier field; this provider does not send
      // it as PKCE and does not claim PKCE protection.
      return {
        configuration,
        authorizationUrl: Redacted.make(url.toString()),
        secrets: OAuthTransactionSecrets.make({
          namespace: "effect-auth/oauth-transaction-secrets/v1",
          state: Redacted.make(state),
          pkceVerifier: Redacted.make(state),
        }),
      };
    }),
    exchangeGrant: Effect.fn("Strava.exchangeGrant")(function* (input) {
      yield* verifyConfiguration(input.configuration);
      if (Redacted.value(input.secrets.state) !== Redacted.value(input.response.state))
        return yield* OAuthProtocolRejected.make({});

      const token = yield* post({
        grant_type: "authorization_code",
        code: Redacted.value(input.response.code),
      });

      const athlete = token.athlete;

      if (athlete === undefined) return yield* OAuthProtocolRejected.make({});

      // Prefer the token endpoint's authenticated receipt. Older Strava
      // responses report accepted scopes only on the bound callback.
      const granted = (token.scope ?? input.response.scope ?? "").split(/[ ,]+/).filter(Boolean);

      if (scopes.some((scope) => !granted.includes(scope)))
        return yield* OAuthProtocolRejected.make({});

      return yield* decodeGrant({
        identity: { provider: key, issuer, subject: String(athlete.id) },
        profile: {
          displayName: [athlete.firstname, athlete.lastname].filter(Boolean).join(" "),
          // Strava uses this relative placeholder when the athlete has no photo.
          ...(athlete.profile === undefined || athlete.profile === "avatar/athlete/large.png"
            ? {}
            : { avatarUrl: athlete.profile }),
          providerData: { ...athlete },
        },
        scopes: granted,
        resources: [],
        accessExpiresAtMillis: token.expires_at * 1000,
        material: material(token),
      }).pipe(Effect.mapError(() => OAuthUnavailable.make({})));
    }),
    refreshGrant: Effect.fn("Strava.refreshGrant")(function* (input) {
      yield* verifyConfiguration(input.context.configuration);
      if (input.material.refreshToken === undefined) return yield* OAuthProtocolRejected.make({});

      const token = yield* post({
        grant_type: "refresh_token",
        refresh_token: Redacted.value(input.material.refreshToken),
      });

      // Fetch identity again so a provider/account mismatch cannot silently
      // replace the grant held for this subject.
      const response = yield* http
        .execute(
          HttpClientRequest.get("https://www.strava.com/api/v3/athlete").pipe(
            HttpClientRequest.bearerToken(Redacted.make(token.access_token)),
          ),
        )
        .pipe(Effect.mapError(() => OAuthUnavailable.make({})));

      if (response.status !== 200) return yield* OAuthUnavailable.make({});

      const athlete = yield* readBody(response).pipe(
        Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(Athlete))),
        Effect.mapError(() => OAuthUnavailable.make({})),
      );

      if (
        String(athlete.id) !== input.context.identity.subject ||
        token.expires_at * 1000 <= DateTime.toEpochMillis(input.verificationStartedAt)
      )
        return yield* OAuthProtocolRejected.make({});

      return yield* decodeGrant({
        identity: input.context.identity,
        scopes:
          token.scope === undefined
            ? input.context.metadata.scopes
            : token.scope.split(/[ ,]+/).filter(Boolean),
        resources: [],
        accessExpiresAtMillis: token.expires_at * 1000,
        material: material(token),
      }).pipe(Effect.mapError(() => OAuthUnavailable.make({})));
    }, Effect.scoped),
    revokeGrant: () => Effect.fail(OAuthUnavailable.make({})),
  };
});

export const provider = (
  input: ProviderOptions,
): ProviderDefinition<OAuthConfigurationError, HttpClient.HttpClient | Crypto.Crypto> => {
  const options = { ...input };

  return {
    configure: Effect.fn("Strava.provider")(function* (binding) {
      if (binding.provider !== key)
        return yield* OAuthConfigurationError.make({ reason: "policy" });

      const profile =
        options.access ?? accessProfile({ clientId: options.clientId, scopes: ["read"] });

      const configured = yield* Effect.forEach(binding.callbacks, (callback) =>
        Effect.map(configure(options, profile, callback), (protocol) => ({
          ...callback,
          protocol,
        })),
      );

      const connected = OAuthConnectedProtocol.of({
        prepareAuthorization: (input) =>
          selectCallback(key, configured, input.callbackId)?.protocol.prepareAuthorization(input) ??
          OAuthUnavailable.make({}),
        exchangeGrant: (input) =>
          selectCallback(key, configured, input.configuration.callbackId)?.protocol.exchangeGrant(
            input,
          ) ?? OAuthUnavailable.make({}),
        refreshGrant: (input) =>
          selectCallback(
            key,
            configured,
            input.context.configuration.callbackId,
          )?.protocol.refreshGrant(input) ?? OAuthUnavailable.make({}),
        revokeGrant: (input) =>
          selectCallback(
            key,
            configured,
            input.context.configuration.callbackId,
          )?.protocol.revokeGrant(input) ?? OAuthUnavailable.make({}),
      });

      return {
        prepareAuthorization: (input) =>
          connected
            .prepareAuthorization({
              ...input,
              profile,
              callbackId: input.callbackId ?? OAuthCallbackId.make(key),
            })
            .pipe(
              Effect.mapError((error) =>
                error._tag === "OAuthProtocolRejected" ? OAuthUnavailable.make({}) : error,
              ),
            ),
        exchangeVerifiedIdentity: (input) =>
          connected
            .exchangeGrant({ ...input, configuration: { ...input.configuration, profile } })
            .pipe(
              Effect.map((grant) => {
                wipeConnectedMaterial(grant.material);

                return {
                  identity: grant.identity,
                  ...(grant.profile === undefined ? {} : { profile: grant.profile }),
                };
              }),
            ),
        ...(options.access === undefined ? {} : { connected }),
      };
    }),
  };
};
