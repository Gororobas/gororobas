import {
  Auth,
  OAuth,
  type Operations,
  type Schema as AuthSchema,
  type Sessions,
  WebCrypto,
} from "@yielded/auth";
import * as OAuthCrypto from "@yielded/auth-crypto/OAuth";
import * as GitHub from "@yielded/auth-openid-client/GitHub";
import { Context, Effect, Layer, Schema, Stream } from "effect";
import type { HttpClientResponse } from "effect/http";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

// Application authority is local. Neither registration data nor Claims needs email.
const Claims = Schema.Struct({ role: Schema.Literal("member"), displayName: Schema.String });

const Registration = Schema.Struct({
  displayName: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
});

const entryPolicy = {
  generation: 1,
  lifetimeMillis: 60_000,
  claimLifetimeMillis: 30_000,
  retentionMillis: 120_000,
  settlementTimeoutMillis: 5_000,
};

export class GitHubAuth extends Auth.Service<GitHubAuth>()("example/GitHubAuth", {
  claims: Claims,
  sessionNamespace: "example/github-sessions",
  strategies: {
    github: OAuth.makeRegistration({
      namespace: "example/github-login",
      policy: entryPolicy,
      registration: Registration,
      registrationPolicy: {
        lifetimeMillis: 60_000,
        maximumVerificationAgeMillis: 60_000,
        retentionMillis: 120_000,
      },
    }),
  },
  defaultStrategy: "github",
}) {}

export const githubSessions = GitHubAuth.sessions;
export const githubSignIn = GitHubAuth.strategies.github;
export const githubRegistration = githubSignIn.registration;

export class GitHubReferenceAccounts extends Context.Service<
  GitHubReferenceAccounts,
  {
    readonly claims: (
      subjectId: AuthSchema.SubjectId,
    ) => Effect.Effect<typeof Claims.Type, OAuth.OAuthUnavailable>;
  }
>()("example/GitHubReferenceAccounts") {}

const claimsLayer = Layer.effect(
  githubSignIn.SessionClaims,
  Effect.gen(function* () {
    const { claims } = yield* GitHubReferenceAccounts;

    return githubSignIn.SessionClaims.of({
      resolve: ({ subjectId, identity }) =>
        claims(subjectId).pipe(
          Effect.map((local) => ({
            ...local,
            displayName: identity.profile?.displayName ?? local.displayName,
          })),
        ),
    });
  }),
);

/** The host supplies actual persistence/registration authority, authentication
 * authority, pending-proof persistence and lifecycle hooks to the returned Layer.
 * Registration atomically provisions a new local subject; it never merges email. */
export const githubSignInLayer = (input: {
  readonly registration: GitHub.Registration;
  readonly bindingKeys: Sessions.SessionSigningKeyring;
  readonly transactionKeys: OAuth.OAuthTransactionKeyring;
  readonly sessionKeys: Sessions.SessionSigningKeyring;
}) => {
  const shared = Layer.mergeAll(
    GitHub.layer(input.registration),
    Auth.RequestBindingConfig.layer({
      generation: 1,
      lifetimeMillis: 120_000,
      keyring: input.bindingKeys,
    }),
    OAuthCrypto.transactionLayer(input.transactionKeys),
    OAuth.OAuthReturnTargets.exactRoutes(["/account"]),
    claimsLayer,
    githubSessions.statelessLayer(
      {
        issuer: "example",
        audience: "example",
        generation: 1,
        idleLifetimeMillis: 60_000,
        absoluteLifetimeMillis: 300_000,
        renewalIntervalMillis: 30_000,
        maximumIssuedAbsoluteLifetimeMillis: 300_000,
        maximumTokenBytes: 16_384,
        requireImmediateInvalidation: false,
      },
      input.sessionKeys,
    ),
  );

  const completion = githubSessions
    .completionLayer({ pendingLifetimeMillis: 60_000, attemptLimit: 3 })
    .pipe(Layer.provide(shared));

  return GitHubAuth.layer.pipe(
    Layer.provide(Layer.merge(shared, completion)),
    Layer.provide(WebCrypto.layerWebCrypto),
  );
};

const decodeUserProfile = Schema.decodeEffect(Schema.fromJsonString(GitHub.GitHubUserProfile));

const readUserProfile = Effect.fn("example.GitHub.readUserProfile")(
  function* (response: HttpClientResponse.HttpClientResponse) {
    let bytes = 0;

    const body = yield* response.stream.pipe(
      Stream.mapEffect((chunk) => {
        bytes += chunk.byteLength;

        return bytes > 1024 * 1024
          ? Effect.fail(OAuth.OAuthUnavailable.make({}))
          : Effect.succeed(chunk);
      }),
      Stream.decodeText(),
      Stream.runFold(
        () => "",
        (text, chunk) => text + chunk,
      ),
    );

    return yield* decodeUserProfile(body);
  },
  Effect.mapError(() => OAuth.OAuthUnavailable.make({})),
);

/** Optional API connection: a distinct module/binder and independent action
 * verifier. This has no session strategy, Claims resolver or login mutation.
 * Its sole sample capability is GET /user, requiring only read:user. */
export const githubProfileConnection = (input: {
  readonly registration: GitHub.Registration;
  readonly bindingKeys: Sessions.SessionSigningKeyring;
  readonly transactionKeys: OAuth.OAuthTransactionKeyring;
  readonly tokenKeys: OAuth.OAuthTransactionKeyring;
}) => {
  const profile = OAuth.OAuthConnectedProfile.make({
    key: OAuth.OAuthPermissionProfileKey.make("github-profile"),
    generation: 1,
    issuance: "active",
    provider: GitHub.gitHubOAuthAppProviderKey,
    clientRegistrationId: input.registration.clientId,
    scopes: ["read:user"],
    resources: [],
    retention: "access-and-refresh",
    maximumAccessLifetimeMillis: 8 * 60 * 60 * 1000,
    maximumRefreshLifetimeMillis: 30 * 24 * 60 * 60 * 1000,
    refreshAheadMillis: 60_000,
    refresh: "rotating",
    revocation: "cohort",
  });

  const connected = OAuth.makeConnectedModule("example/github-api", {
    ...entryPolicy,
    profiles: [profile],
    maximumEvidenceAgeMillis: 60_000,
    refreshClaimLifetimeMillis: 30_000,
    useAdmissionLifetimeMillis: 5_000,
  });

  const shared = Layer.mergeAll(
    GitHub.layerConnected({ ...input.registration, profiles: [profile] }),
    connected.binding.signedLayer({
      generation: 1,
      lifetimeMillis: 120_000,
      keyring: input.bindingKeys,
    }),
    OAuthCrypto.connectedTransactionLayer(input.transactionKeys),
    OAuthCrypto.connectedTokenLayer(input.tokenKeys),
    OAuth.OAuthReturnTargets.exactRoutes(["/account/connections"]),
  );

  const methods = Layer.mergeAll(
    connected.layer,
    connected.accessLayer,
    connected.maintenanceLayer,
  ).pipe(Layer.provide(shared), Layer.provide(WebCrypto.layerWebCrypto));

  const readMyProfile = Effect.fn("example.GitHub.readMyProfile")(
    function* (caller: Operations.AuthInvocation, grantId: typeof OAuth.OAuthGrantId.Type) {
      const access = yield* connected.ConnectedAccess;
      const http = yield* HttpClient.HttpClient;

      return yield* access.withAccessToken(caller, { grantId, profileKey: profile.key }, (token) =>
        http
          .execute(
            HttpClientRequest.get("https://api.github.com/user", {
              headers: {
                Accept: "application/vnd.github+json",
                "User-Agent": "effect-auth-reference",
                "X-GitHub-Api-Version": "2026-03-10",
              },
            }).pipe(HttpClientRequest.bearerToken(token)),
          )
          .pipe(
            Effect.flatMap((response) =>
              response.status === 200
                ? readUserProfile(response)
                : Effect.fail(OAuth.OAuthUnavailable.make({})),
            ),
            Effect.timeout(10_000),
            Effect.mapError(() => OAuth.OAuthUnavailable.make({})),
          ),
      );
    },
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual", credentials: "omit" }),
  );

  return {
    profile,
    connected,
    methods,
    handlers: connected.handlersLayer.pipe(Layer.provide(methods)),
    readMyProfile,
  };
};
