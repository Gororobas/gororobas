import { Passkey, TotpContract } from "@yielded/auth";
import { Schema } from "effect";

/** Shared application contracts contain no database, verifier, or secret configuration. */
export const registrationSchema = Schema.Struct({
  accountId: Schema.String.check(
    Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  ),
  organization: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
});

export const profile = Passkey.PasskeyProfile.make({
  profileId: "primary",
  rpId: "localhost",
  rpName: "Design Studio",
  origins: ["http://localhost:4179"],
  developmentLocalhost: true,
  residentKey: "required",
  userVerification: "required",
  primarySignIn: true,
  attestation: "none",
  algorithms: [-7, -257],
});

export const policy = Passkey.PasskeyMethodPolicy.make({
  profiles: [profile],
  lifetimeMillis: 120000,
  admission: {
    global: { limit: 1000, windowMillis: 60000 },
    subject: { limit: 100, windowMillis: 60000 },
    target: { limit: 100, windowMillis: 60000 },
  },
});

export const management = Passkey.PasskeyManagementPolicy.make({
  maximumCredentials: 5,
  maximumEvidenceAgeMillis: 120000,
  requireImmediateInvalidation: true,
});

export const requirement = Passkey.PasskeyRequirement.make({
  maximumAgeMillis: 120000,
  alternatives: [
    { factors: ["possession"], minimumCredentials: 1, userVerified: true, phishingResistant: true },
  ],
});

export const StudioClaims = Schema.Struct({
  memberId: registrationSchema.fields.accountId,
  organization: Schema.NonEmptyString,
  permissions: Schema.Array(Schema.Literal("design:edit")),
});

export const authenticatorPolicy = TotpContract.TotpPolicy.make({
  issuer: "Design Studio",
  enrollmentLifetimeMillis: 300000,
  revealLifetimeMillis: 60000,
  clockSkewSteps: 1,
  attemptLimit: 5,
  attemptWindowMillis: 60000,
  maximumEvidenceAgeMillis: 120000,
  allowRecoveryCodeForPending: true,
  lostFactorRecovery: "deny",
  requireImmediateInvalidation: true,
});
