import { Effect, Schema } from "effect";

import { PasskeyConfigurationError } from "./errors";
import { PasskeyGeneration, PasskeyProfile, PasskeyRequirement } from "./models";
import { snapshotPasskey } from "./snapshot";

const budget = Schema.Struct({
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10000 })),
  windowMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 86400000 })),
});

export const PasskeyMethodPolicy = Schema.Struct({
  generation: PasskeyGeneration,
  profiles: Schema.NonEmptyArray(PasskeyProfile).check(Schema.isMaxLength(32)),
  lifetimeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 300000 })),
  claimLifetimeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 120000 })),
  retentionMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 604800000 })),
  maximumPending: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100000 })),
  maximumPendingPerSubject: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
  admission: Schema.Struct({ global: budget, subject: budget, target: budget }),
});

export type PasskeyMethodPolicy = typeof PasskeyMethodPolicy.Type;

export const PasskeyManagementPolicy = Schema.Struct({
  maximumCredentials: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })),
  /** Application-selected age limit; action requirements can impose a shorter one. */
  maximumEvidenceAgeMillis: PasskeyRequirement.fields.maximumAgeMillis,
  /** Credential removal must support immediate revocation of existing authentication. */
  requireImmediateInvalidation: Schema.Boolean,
});

export type PasskeyManagementPolicy = typeof PasskeyManagementPolicy.Type;

export const validatePasskeyPolicy = Effect.fn("validatePasskeyPolicy")(function* (
  input: PasskeyMethodPolicy,
) {
  const policy = yield* snapshotPasskey(PasskeyMethodPolicy, input).pipe(
    Effect.mapError(() => PasskeyConfigurationError.make({})),
  );

  if (
    policy.retentionMillis <
    Math.max(
      policy.lifetimeMillis + policy.claimLifetimeMillis,
      ...Object.values(policy.admission).map((b) => b.windowMillis),
    )
  )
    return yield* PasskeyConfigurationError.make({});
  const ids = new Set<string>();

  for (const profile of policy.profiles) {
    if (
      ids.has(profile.profileId) ||
      new Set(profile.origins).size !== profile.origins.length ||
      new Set(profile.algorithms).size !== profile.algorithms.length
    )
      return yield* PasskeyConfigurationError.make({});
    ids.add(profile.profileId);
    if (
      profile.primarySignIn &&
      (profile.userVerification !== "required" || profile.residentKey !== "required")
    )
      return yield* PasskeyConfigurationError.make({});
    for (const origin of profile.origins) {
      const valid = yield* Effect.try({
        try: () => {
          const url = new URL(origin);

          return (
            url.origin === origin &&
            url.username === "" &&
            url.password === "" &&
            (url.protocol === "https:" ||
              (profile.developmentLocalhost &&
                profile.rpId === "localhost" &&
                url.hostname === "localhost" &&
                url.protocol === "http:")) &&
            (url.hostname === profile.rpId || url.hostname.endsWith("." + profile.rpId))
          );
        },
        catch: () => PasskeyConfigurationError.make({}),
      });

      if (!valid) return yield* PasskeyConfigurationError.make({});
    }
  }

  return policy;
});
