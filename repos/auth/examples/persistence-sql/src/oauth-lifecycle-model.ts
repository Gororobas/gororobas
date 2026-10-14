import { Auth, AuthContract, OAuth, Sessions, Strava } from "@yielded/auth";
import { Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";

export const moduleId = "demo/sql-oauth";
export const ownerId = "demo-owner";
export const callbackId = OAuth.OAuthCallbackId.make("strava");
export const profile = Strava.accessProfile({ clientId: "1234", scopes: ["activity:read_all"] });

export const Registration = Schema.Struct({
  displayName: Schema.NonEmptyString.check(Schema.isMaxLength(80)),
});

// Public demo keys only. They remain stable so this disposable example can reopen its grants.
export const keys = (byte: number) => ({
  activeKeyId: "demo",
  keys: [{ id: "demo", material: Redacted.make(Base64Url.encode(new Uint8Array(32).fill(byte))) }],
});

export const AuthApi = AuthContract.make("sql-oauth-lifecycle", {
  claims: Schema.Struct({ role: Schema.Literal("member") }),
  actions: () => ({
    listLinkedAccounts: AuthContract.oauthListLinkedAccounts({ strategy: "accounts" }),
  }),
});

export const AppAuth = Auth.make(AuthApi, {
  sessions: Sessions.stateless(),
  strategies: {
    oauth: OAuth.make({ namespace: moduleId, access: profile }),
    registration: OAuth.makeRegistration({
      namespace: `${moduleId}/registration`,
      registration: Registration,
      registrationPolicy: {
        lifetimeMillis: 300_000,
        maximumVerificationAgeMillis: 300_000,
        retentionMillis: 600_000,
      },
    }),
    accounts: OAuth.makeAccounts({
      namespace: moduleId,
      policy: {
        generation: 1,
        lifetimeMillis: 300_000,
        exchangeTimeoutMillis: 30_000,
        maximumEvidenceAgeMillis: 300_000,
        requireImmediateInvalidation: false,
      },
    }),
  },
  defaultStrategy: "oauth",
});
