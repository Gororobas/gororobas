import {
  Auth,
  Http,
  type Operations,
  Passkey,
  Password,
  PhoneOtp,
  Proofs,
  Sessions,
} from "@yielded/auth";
import { Effect, Layer, Schema } from "effect";

const AccountClaims = Schema.Struct({
  accountId: Schema.String,
  displayName: Schema.String,
});

/** Call once at the application's composition root with its decoded configuration.
 * The returned Layer requires the application's persistence and account authorities
 * plus SmsDelivery.
 * Each adapter can provide several related services together.
 * Auth supplies proof request limiting; HTTP derives the caller from the socket peer.
 */
export const makeApplicationAuth = (configuration: {
  readonly relyingParty: {
    readonly id: string;
    readonly name: string;
    readonly origins: readonly string[];
  };
  readonly phoneKeys: Proofs.ProofKeyring;
  readonly requestBinding: Operations.RequestBindingConfiguration;
  readonly sessions: Sessions.SessionOptions;
  readonly origin: string;
}) => {
  const AppAuth = Auth.make("app/Auth", {
    claims: AccountClaims,
    sessions: Sessions.stateful(configuration.sessions),
    strategies: {
      password: Password.make(),
      passkey: Passkey.make(),
      phone: PhoneOtp.make(),
    },
    defaultStrategy: "password",
  });

  const AuthLive = AppAuth.layer.pipe(
    Layer.provide([
      Auth.RequestBindingConfig.layer(configuration.requestBinding),
      Proofs.ProofKeys.layer(configuration.phoneKeys),
      Passkey.PasskeyConfig.layer(configuration.relyingParty),
    ]),
  );

  const http = Http.make(AppAuth, { origin: configuration.origin });

  const AuthRoutes = Http.layer(AppAuth, { origin: configuration.origin }).pipe(
    Layer.provide([
      Auth.RequestBindingConfig.layer(configuration.requestBinding),
      Proofs.ProofKeys.layer(configuration.phoneKeys),
      Passkey.PasskeyConfig.layer(configuration.relyingParty),
    ]),
  );

  // Application code contains its own projection; auth owns request and cookie mechanics.
  const currentMember = Effect.fn("app.currentMember")(function* () {
    const auth = yield* AppAuth;
    const session = yield* auth.requireSession();

    return { subjectId: session.subjectId, name: session.claims.displayName };
  });

  // In any handler covered by http.middleware:
  // const auth = yield* AppAuth;
  // yield* auth.signIn({ email, password });
  // yield* auth.signIn("phone", { phoneNumber });
  // yield* auth.signOut();

  // Application composition:
  // const AuthDependenciesLive = Layer.mergeAll(PersistenceLive, AccountsLive, SmsLive);
  // const AppLive = AuthRoutes.pipe(
  //   Layer.provide(AuthDependenciesLive),
  // );
  // AccountsLive implements AppAuth.strategies.password.SessionClaims,
  // AppAuth.strategies.passkey.SessionClaims, AppAuth.strategies.phone.SessionClaims
  // and Sessions.AuthenticationAuthority for this account model.
  // PersistenceLive supplies session/password/passkey/proof storage and exact credential lookups.
  return {
    AppAuth,
    AuthLive,
    http,
    AuthRoutes,
    currentMember,
  };
};
