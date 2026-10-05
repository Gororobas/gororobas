import { Effect, Schema } from "effect";

import { PasswordMethodConfigurationError } from "./errors";

const Budget = Schema.Struct({
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000000 })),
  windowMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 86400000 })),
});

export const PasswordAttemptPolicy = Schema.Struct({
  identifier: Budget,
  subject: Budget,
  action: Budget,
  maximumPending: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
  attemptLifetimeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 300000 })),
});

export type PasswordAttemptPolicy = typeof PasswordAttemptPolicy.Type;

export const PasswordMethodPolicy = Schema.Struct({
  attempts: PasswordAttemptPolicy,
  maximumEvidenceAgeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 300000 })),
  requireImmediateInvalidation: Schema.Boolean,
});

export type PasswordMethodPolicy = typeof PasswordMethodPolicy.Type;

export const defaultPasswordMethodPolicy: PasswordMethodPolicy = Object.freeze({
  maximumEvidenceAgeMillis: 60_000,
  requireImmediateInvalidation: false,
  attempts: Object.freeze({
    identifier: Object.freeze({ limit: 10, windowMillis: 60_000 }),
    subject: Object.freeze({ limit: 10, windowMillis: 60_000 }),
    action: Object.freeze({ limit: 1000, windowMillis: 60_000 }),
    maximumPending: 10,
    attemptLifetimeMillis: 60_000,
  }),
});

/** Capture only policy data; validation remains a typed layer-construction failure. */
export const snapshotPasswordMethodPolicy = (input: PasswordMethodPolicy): PasswordMethodPolicy =>
  Object.freeze({
    ...input,
    attempts: Object.freeze({
      ...input?.attempts,
      identifier: Object.freeze({ ...input?.attempts?.identifier }),
      subject: Object.freeze({ ...input?.attempts?.subject }),
      action: Object.freeze({ ...input?.attempts?.action }),
    }),
  });

export const validatePasswordMethodPolicy = Effect.fn("validatePasswordMethodPolicy")(function* (
  input: PasswordMethodPolicy,
) {
  const p = yield* Schema.decodeEffect(PasswordMethodPolicy)(input).pipe(
    Effect.mapError(() => PasswordMethodConfigurationError.make({})),
  );

  return Object.freeze({
    ...p,
    attempts: Object.freeze({
      ...p.attempts,
      identifier: Object.freeze({ ...p.attempts.identifier }),
      subject: Object.freeze({ ...p.attempts.subject }),
      action: Object.freeze({ ...p.attempts.action }),
    }),
  });
});
