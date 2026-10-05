import { Auth, PhoneOtp } from "@yielded/auth";
import { Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { lifecyclePolicy } from "./phone-sqlite-schema";
const budget = { limit: 30, windowMillis: 60_000 };

export const proofPolicy = {
  lifetimeMillis: 60_000,
  continuationLifetimeMillis: 30_000,
  maximumFailedAttempts: 3,
  maximumDeliveryAttempts: 1,
  deliveryClaimMillis: 5_000,
  deliveryRetryMillis: 10_000,
  requestRetentionMillis: 3_600_000,
  abuse: {
    issues: budget,
    attempts: budget,
    subjectIssues: budget,
    subjectAttempts: budget,
    actionIssues: budget,
    actionAttempts: budget,
    resendCooldownMillis: 0,
  },
};

// Example-only static keys. A deployed consumer supplies independently managed keyrings.
export const keyring = {
  activeKeyId: "example",
  keys: [
    {
      id: "example",
      // Demo-only key material. Production requires independently generated random keys.
      material: Redacted.make(Base64Url.encode(new Uint8Array(32).fill(91))),
    },
  ],
};

export const Claims = Schema.Struct({
  customerNumber: Schema.FiniteFromString,
  segment: Schema.Literals(["retail", "wholesale"]),
});

export const shopAuth = Auth.make("shop", {
  sessionNamespace: "shop/sessions",
  claims: Claims,
  strategies: {
    phone: PhoneOtp.make({ policy: proofPolicy, lifecycle: lifecyclePolicy }),
  },
  defaultStrategy: "phone",
});

export const phone = shopAuth.strategies.phone;
export const sessions = shopAuth.sessions;

export const sessionPolicy = {
  issuer: "shop.example",
  audience: "customer-portal",
  generation: 1,
  idleLifetimeMillis: 60_000,
  absoluteLifetimeMillis: 300_000,
  renewalIntervalMillis: 1_000,
  maximumIssuedAbsoluteLifetimeMillis: 300_000,
  maximumTokenBytes: 8192,
  requireImmediateInvalidation: false,
};
