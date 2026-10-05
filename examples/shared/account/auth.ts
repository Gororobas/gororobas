import { Auth, Email, Passkey, Password, Sessions } from "@yielded/auth";

import { AuthApi, emailProofPolicy, Registration } from "./contract";

export const sessionConfiguration = Sessions.stateful();

const sessionLifetimeMillis = sessionConfiguration.policy(
  AuthApi.sessions.moduleId,
).absoluteLifetimeMillis;

export const accountStrategies = {
  password: Password.make({
    registration: Registration,
    reset: Password.resetCode({ policy: emailProofPolicy }),
  }),
  email: Email.makeAddresses({
    policy: emailProofPolicy,
    addresses: { maximumEvidenceAgeMillis: 300_000, requireImmediateInvalidation: true },
  }),
  passkey: Passkey.make(),
  passkeys: Passkey.makeManagement({
    policy: { generation: 2 },
    management: {
      maximumCredentials: 5,
      maximumEvidenceAgeMillis: 300_000,
      requireImmediateInvalidation: true,
    },
  }),
};

export const AppAuth = Auth.make(AuthApi, {
  strategies: accountStrategies,
  sessions: sessionConfiguration,
});

export const recoveryRequirement = Sessions.AuthenticationRequirement.make({
  alternatives: [
    {
      factors: ["possession"],
      userVerified: false,
      phishingResistant: false,
      minimumCredentials: 1,
    },
  ],
  maximumAgeMillis: 60_000,
});

// A password or a user-verified passkey can sign in. Verified email permits recovery.
export const requirement = Sessions.AuthenticationRequirement.make({
  alternatives: [
    {
      factors: ["knowledge"],
      userVerified: false,
      phishingResistant: false,
      minimumCredentials: 1,
    },
    {
      factors: ["possession"],
      userVerified: true,
      phishingResistant: true,
      minimumCredentials: 1,
    },
  ],
  maximumAgeMillis: 300_000,
});

// Email confirmation accepts the existing valid session. Passkey enrollment uses fresh evidence.
export const sessionRequirement = Sessions.AuthenticationRequirement.make({
  ...requirement,
  maximumAgeMillis: sessionLifetimeMillis,
});
