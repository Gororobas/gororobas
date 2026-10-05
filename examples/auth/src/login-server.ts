import { Auth, Email, Http, OAuth, Sessions } from "@yielded/auth";
import * as OAuthCrypto from "@yielded/auth-crypto/OAuth";
import * as OpenIdClient from "@yielded/auth-openid-client";
import * as GitHub from "@yielded/auth-openid-client/GitHub";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { LoginApi, Registration } from "./login-contract";

export const makeAppAuth = (email: Email.EmailCodeOptions) =>
  Auth.make(LoginApi, {
    sessions: Sessions.stateful(),
    strategies: {
      email: Email.makeCode({ ...email, namespace: "example/email" }),
      emailRegistration: Email.makeRegistration({
        ...email,
        namespace: "example/email",
        registration: Registration,
      }),
      social: OAuth.makeRegistration({
        namespace: "example/social-login",
        registration: Registration,
        policy: {
          generation: 1,
          lifetimeMillis: 300_000,
          claimLifetimeMillis: 30_000,
          settlementTimeoutMillis: 5_000,
          retentionMillis: 600_000,
        },
        registrationPolicy: {
          lifetimeMillis: 300_000,
          maximumVerificationAgeMillis: 300_000,
          retentionMillis: 600_000,
        },
      }),
    },
    defaultStrategy: "social",
  });

// Set this to the actual trusted HTTPS origin, not a caller-controlled Host header.
const origin = "https://app.example.com";

/** Construct once at the application's composition root. Supply durable Email
 * and OAuth registration authorities, ProofPersistence/abuse budgets, shared
 * session persistence/AuthenticationAuthority, each strategy's SessionClaims,
 * EmailSignInTargets and EmailDelivery to Routes. Drizzle D1/SQLite DO
 * adapters implement the transaction ports; no example memory store is installed.
 * Every unsupplied service remains visible in the returned Layer type. */
export const makeServer = (config: {
  readonly email: Email.EmailCodeOptions;
  readonly binding: Sessions.SessionSigningKeyring;
  readonly transactions: OAuth.OAuthTransactionKeyring;
  readonly github: GitHub.ProviderOptions;
  readonly google?: Pick<GitHub.ProviderRegistration, "clientId" | "clientSecret">;
}) => {
  const AppAuth = makeAppAuth(config.email);

  const http = Http.make(AppAuth, {
    origin,
    oauth: {
      providers: {
        github: GitHub.provider(config.github),
        ...(config.google === undefined
          ? {}
          : {
              google: OpenIdClient.provider({
                protocol: "oidc",
                issuer: "https://accounts.google.com",
                tokenEndpointAuthMethod: "client_secret_post",
                ...config.google,
              }),
            }),
      },
      // Registration UI belongs to the app. Only public correlation enters this
      // URL; the registration credential and request binder stay in HttpOnly cookies.
      respond: (value, { flowId }) =>
        Effect.gen(function* () {
          const result = yield* Schema.decodeUnknownEffect(
            LoginApi.actions.completeSignIn.route.operation.rpc.successSchema,
          )(value).pipe(Effect.orDie);

          const target =
            "_tag" in result && result._tag === "RegistrationRequired"
              ? `/register?${new URLSearchParams({ flowId, reference: result.reference })}`
              : result.returnTarget;

          return new Response(null, { status: 303, headers: { location: target } });
        }),
    },
  });

  const ApplicationRoutes = HttpRouter.add(
    "GET",
    "/account",
    Effect.gen(function* () {
      const auth = yield* AppAuth;
      const session = yield* auth.requireSession();

      return yield* HttpServerResponse.json({
        subjectId: session.subjectId,
        displayName: session.claims.displayName,
      });
    }),
  );

  // Auth supplies proof request limiting and HTTP supplies the current socket peer.
  const Routes = Layer.mergeAll(http.routes(), ApplicationRoutes.pipe(http.middleware)).pipe(
    Layer.provide(http.layer),
    Layer.provide(
      Layer.mergeAll(
        Auth.RequestBindingConfig.layer({
          generation: 1,
          lifetimeMillis: 600_000,
          keyring: config.binding,
        }),
        OAuthCrypto.transactionLayer(config.transactions),
        OAuth.OAuthReturnTargets.exactRoutes(["/account"]),
        Email.EmailReturnTargets.exactRoutes(["/account"]),
      ),
    ),
  );

  return { AppAuth, http, Routes };
};
