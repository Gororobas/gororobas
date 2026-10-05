import {
  OAuthConnectedProfile,
  OAuthConnectedProtocol,
  OAuthProtocol,
  OAuthUnavailable,
  OAuthCallbackId,
  OAuthGeneration,
  OAuthIssuer,
  OAuthRedirectUri,
  snapshotOAuthSync,
} from "@yielded/auth/OAuth";
import { Effect, Layer, Predicate, Redacted, Schema } from "effect";
import { Base64 } from "effect/encoding";
import { FetchHttpClient } from "effect/http";
import type { CustomFetch } from "openid-client";

import {
  DefiniteTokenRejection,
  tokenCompatibility,
  type ConnectedCompatibility,
} from "../openid-client/compatibility";
import { makeConnectedProtocolWithCompatibility } from "../openid-client/connected/protocol";
import {
  OpenIdClientConfigurationError,
  type OpenIdClientOAuthProvider,
} from "../openid-client/models";
import { makeOpenIdClientOAuthProtocol } from "../openid-client/protocol";
import { ProviderRevocation } from "../openid-client/ProviderRevocation";
import { boundedFetch } from "../openid-client/transport";
import { decodeGitHubIdentity, gitHubOAuthAppProviderKey } from "./identity";
import type {
  GitHubOAuthAppConnectedProtocolOptions,
  GitHubOAuthAppGeneration,
  GitHubOAuthAppProtocolOptions,
} from "./models";

const unavailable = () => OAuthUnavailable.make({});
const invalid = () => OpenIdClientConfigurationError.make({ reason: "provider" });
// GitHub's OAuth authorization server issuer, including its RFC 9207 callback value.
const issuer = OAuthIssuer.make("https://github.com/login/oauth");

const headers = Object.freeze({
  Accept: "application/vnd.github+json",
  "User-Agent": "effect-auth-github-oauth-app",
  "X-GitHub-Api-Version": "2026-03-10",
});

const generation = Schema.Struct({
  configurationGeneration: OAuthGeneration,
  issuance: Schema.Literals(["active", "retired"]),
  clientId: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9._-]{1,256}$/)),
  clientSecret: Schema.RedactedFromValue(Schema.NonEmptyString.check(Schema.isMaxLength(4096))),
  callbacks: Schema.Array(
    Schema.Struct({ callbackId: OAuthCallbackId, redirectUri: OAuthRedirectUri }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
});

const generations = Schema.Array(generation).check(Schema.isMinLength(1), Schema.isMaxLength(64));

const connectedGenerations = Schema.Array(
  Schema.Struct({
    ...generation.fields,
    profiles: Schema.Array(OAuthConnectedProfile).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(64),
    ),
  }),
).check(Schema.isMinLength(1), Schema.isMaxLength(64));

const timeout = Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 30 }));
const isTimeout = Schema.is(timeout);

const capture = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  registrations: S["Type"],
  options: {
    readonly timeoutSeconds: number;
  },
) =>
  Effect.try({
    try: () => {
      const result = snapshotOAuthSync(schema, registrations);
      const timeoutSeconds = options.timeoutSeconds;

      if (!isTimeout(timeoutSeconds)) throw invalid();

      return { registrations: result, timeoutSeconds };
    },
    catch: invalid,
  });

const provider = (
  registration: GitHubOAuthAppGeneration,
): Omit<OpenIdClientOAuthProvider, "scopes"> => ({
  provider: gitHubOAuthAppProviderKey,
  configurationGeneration: registration.configurationGeneration,
  issuance: registration.issuance,
  issuer,
  protocol: "oauth",
  responseIssuerMode: "required",
  clientId: registration.clientId,
  authentication: { method: "client_secret_post", secret: registration.clientSecret },
  callbacks: registration.callbacks,
  authorizationEndpoint: "https://github.com/login/oauth/authorize",
  tokenEndpoint: "https://github.com/login/oauth/access_token",
  pkceS256: true,
  identitySource: {
    url: "https://api.github.com/user",
    headers,
    decodeIdentity: decodeGitHubIdentity,
  },
});

const csvCell = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_:-]{1,256}$/));
const isCell = Schema.is(csvCell);

/** GitHub's receipt is comma-delimited, unlike the generic OAuth scope string. */
const scopes = (
  receipt: string | undefined,
  expected: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (receipt === undefined || receipt.length > 16447) throw unavailable();

  const result =
    receipt === "" ? [] : receipt.split(",").map((cell) => cell.replace(/^[ \t]+|[ \t]+$/g, ""));

  if (
    result.length > 64 ||
    result.some((cell) => !isCell(cell)) ||
    new Set(result).size !== result.length ||
    result.length !== expected.length ||
    result.some((cell) => !expected.includes(cell))
  )
    throw unavailable();

  return result;
};

const token = Schema.NonEmptyString.check(Schema.isMaxLength(16384));
const expiry = Schema.Finite.check(Schema.isGreaterThan(0));

const receiptSchema = Schema.Struct({
  access_token: token,
  token_type: Schema.String.check(Schema.isPattern(/^[Bb][Ee][Aa][Rr][Ee][Rr]$/)),
  scope: Schema.String.check(Schema.isMaxLength(16447)),
  expires_in: Schema.optionalKey(expiry),
  refresh_token: Schema.optionalKey(token),
  refresh_token_expires_in: Schema.optionalKey(expiry),
});

// oxlint-disable-next-line no-restricted-properties -- Inspect the bounded raw receipt before the maintained parser can coerce expiry fields.
const decodeReceipt = Schema.decodeUnknownSync(receiptSchema);

const encodeRevocation = Schema.encodeSync(
  Schema.fromJsonString(Schema.Struct({ access_token: token })),
);

const terminalReceipt = Schema.Struct({
  error: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
  error_description: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4096))),
  error_uri: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2048))),
});

// oxlint-disable-next-line no-restricted-properties -- Fully validate the raw terminal receipt before classifying a provider rejection.
const decodeTerminalReceipt = Schema.decodeUnknownSync(terminalReceipt);

const successKeys = [
  "access_token",
  "token_type",
  "scope",
  "expires_in",
  "refresh_token",
  "refresh_token_expires_in",
  "id_token",
];

const compatibility: ConnectedCompatibility = Object.freeze<ConnectedCompatibility>({
  inspectReceipt: ({ body, status, contentType }, input) => {
    if (contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json")
      throw unavailable();
    if (!Predicate.isObject(body)) throw unavailable();
    if (Object.hasOwn(body, "error")) {
      if (successKeys.some((key) => Object.hasOwn(body, key))) throw unavailable();
      const terminal = decodeTerminalReceipt(body);

      if (
        (status === 200 || status === 400) &&
        terminal.error ===
          (input.operation === "authorization_code" ? "bad_verification_code" : "bad_refresh_token")
      ) {
        throw new DefiniteTokenRejection();
      }
      throw unavailable();
    }
    if (
      status !== 200 ||
      ["error_description", "error_uri", "id_token"].some((key) => Object.hasOwn(body, key))
    )
      throw unavailable();
    const receipt = decodeReceipt(body);

    scopes(receipt.scope, input.scopes);
    if (
      input.refreshRequired &&
      (receipt.refresh_token === undefined ||
        receipt.expires_in === undefined ||
        receipt.refresh_token_expires_in === undefined)
    )
      throw unavailable();
  },
  authorizationScopes: (permissions, refresh) =>
    refresh ? [...permissions, "offline_access"] : permissions,
  decodeScopes: scopes,
  includeRefreshScope: false,
});

const revocationLayer = (options: Pick<GitHubOAuthAppConnectedProtocolOptions, "timeoutSeconds">) =>
  Layer.effect(
    ProviderRevocation,
    Effect.gen(function* () {
      const transport = yield* FetchHttpClient.Fetch;

      const fetch: CustomFetch = (url, { body, ...init }) =>
        transport(url, {
          ...init,
          ...(body === undefined
            ? {}
            : { body: body instanceof Uint8Array ? new Uint8Array(body) : body }),
        });

      const timeoutSeconds = options.timeoutSeconds;

      return ProviderRevocation.of({
        revoke: Effect.fn("GitHubOAuthApp.revoke")(function* (input) {
          yield* Effect.tryPromise({
            try: async (effectSignal) => {
              if (
                input.authentication.method !== "client_secret_post" ||
                input.context.configuration.profile.clientRegistrationId !== input.clientId ||
                input.context.identity.provider !== gitHubOAuthAppProviderKey ||
                input.context.identity.issuer !== issuer
              )
                throw unavailable();
              const url = `https://api.github.com/applications/${encodeURIComponent(input.clientId)}/grant`;

              const signal = AbortSignal.any([
                effectSignal,
                AbortSignal.timeout(Math.ceil(timeoutSeconds * 1000)),
              ]);

              const transport = boundedFetch(fetch, signal, new Set([url]));

              const response = await transport(url, {
                method: "DELETE",
                redirect: "manual",
                headers: {
                  ...headers,
                  "Content-Type": "application/json",
                  Authorization: `Basic ${Base64.encode(`${input.clientId}:${Redacted.value(input.authentication.secret)}`)}`,
                },
                body: encodeRevocation({
                  access_token: Redacted.value(input.material.accessToken),
                }),
                signal,
              });

              signal.throwIfAborted();
              if (response.status !== 204) throw unavailable();
            },
            catch: unavailable,
          });
        }),
      });
    }),
  );

/** A GitHub.com OAuth App generation for the same provider list as generic OIDC.
 * Retains GitHub receipt/error rules and requests read:user, with no repository access.
 * Construction performs no I/O; invalid configuration throws the typed configuration error. */
export const gitHubOAuthAppProvider = (
  registration: GitHubOAuthAppGeneration,
): OpenIdClientOAuthProvider => {
  let saved: GitHubOAuthAppGeneration;

  try {
    saved = snapshotOAuthSync(generation, registration);
  } catch {
    throw invalid();
  }

  return {
    ...provider(saved),
    scopes: ["read:user"],
    [tokenCompatibility]: compatibility,
  };
};

export const makeGitHubOAuthAppProtocol = Effect.fn("makeGitHubOAuthAppProtocol")(function* (
  options: GitHubOAuthAppProtocolOptions,
) {
  const saved = yield* capture(generations, options.registrations, options);

  if (saved.registrations.filter((item) => item.issuance === "active").length !== 1)
    return yield* invalid();

  return yield* makeOpenIdClientOAuthProtocol({
    ...saved,
    providers: saved.registrations.map(gitHubOAuthAppProvider),
  });
});

export const makeGitHubOAuthAppConnectedProtocol = Effect.fn("makeGitHubOAuthAppConnectedProtocol")(
  function* (options: GitHubOAuthAppConnectedProtocolOptions) {
    const saved = yield* capture(connectedGenerations, options.registrations, options);

    if (saved.registrations.filter((item) => item.issuance === "active").length !== 1)
      return yield* invalid();
    for (const registration of saved.registrations) {
      for (const profile of registration.profiles) {
        if (
          profile.provider !== gitHubOAuthAppProviderKey ||
          profile.clientRegistrationId !== registration.clientId ||
          profile.resources.length !== 0 ||
          profile.scopes.some((scope) => scope === "offline_access" || !isCell(scope)) ||
          (profile.retention === "access-only"
            ? profile.refresh !== "unsupported" ||
              profile.maximumRefreshLifetimeMillis !== undefined
            : profile.refresh !== "rotating" || profile.maximumRefreshLifetimeMillis === undefined)
        )
          return yield* invalid();
      }
    }

    return yield* makeConnectedProtocolWithCompatibility(
      {
        ...saved,
        providers: saved.registrations.map((item) => ({
          ...provider(item),
          profiles: item.profiles,
          clientRegistrationId: item.clientId,
          resourceIndicators: "unsupported",
          refreshExpiry: { field: "refresh_token_expires_in", zero: "expired" },
          revocation: { mode: "provider-cohort" },
        })),
      },
      compatibility,
    ).pipe(Effect.provide(revocationLayer(saved)));
  },
);

export const gitHubOAuthAppProtocolLayer = (options: GitHubOAuthAppProtocolOptions) =>
  Layer.effect(OAuthProtocol, makeGitHubOAuthAppProtocol(options));

export const gitHubOAuthAppConnectedProtocolLayer = (
  options: GitHubOAuthAppConnectedProtocolOptions,
) => Layer.effect(OAuthConnectedProtocol, makeGitHubOAuthAppConnectedProtocol(options));
