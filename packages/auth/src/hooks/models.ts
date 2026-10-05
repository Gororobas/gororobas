import { Schema } from "effect";

import { LoginIdentifier } from "../identity/models";
import { SubjectId } from "../Schema";

export const LifecycleAction = Schema.Literals([
  "registration",
  "sign-in",
  "session-creation",
  "credential-change",
  "factor-change",
  "identifier-change",
  "linking",
  "sign-out",
  "proof-request",
  "proof-verification",
  "proof-completion",
]);

export type LifecycleAction = typeof LifecycleAction.Type;

/** Deliberately excludes credentials, proofs, tokens, claims, and verification authority. */
export const LifecycleSnapshot = Schema.Struct({
  action: LifecycleAction,
  operation: Schema.NonEmptyString,
  subjectId: Schema.optionalKey(SubjectId),
  method: Schema.optionalKey(Schema.NonEmptyString),
  identifiers: Schema.Array(LoginIdentifier),
});

export type LifecycleSnapshot = typeof LifecycleSnapshot.Type;

export const LifecycleEventId = Schema.NonEmptyString.pipe(
  Schema.brand("effect-auth/LifecycleEventId"),
);

export type LifecycleEventId = typeof LifecycleEventId.Type;

/** The owner supplies a stable, nonsecret identifier; delivery retries reuse this exact event. */
export const LifecycleEvent = Schema.Struct({
  id: LifecycleEventId,
  occurredAtMillis: Schema.Int.check(
    Schema.isBetween({ minimum: -8640000000000000, maximum: 8640000000000000 }),
  ),
  snapshot: LifecycleSnapshot,
});

export type LifecycleEvent = typeof LifecycleEvent.Type;

export class HookDenied extends Schema.TaggedError<HookDenied>()("HookDenied", {
  reason: Schema.Literals(["policy", "unavailable"]),
}) {}

export class HookDeliveryFailed extends Schema.TaggedError<HookDeliveryFailed>()(
  "HookDeliveryFailed",
  {},
) {}

export class HookConfigurationError extends Schema.TaggedError<HookConfigurationError>()(
  "HookConfigurationError",
  {
    reason: Schema.Literals([
      "duplicate-contribution",
      "duplicate-event",
      "duplicate-route",
      "incompatible-transaction",
      "closed-journal",
      "invalid-snapshot",
    ]),
    contribution: Schema.String,
  },
) {}

export interface HookDelivery {
  readonly eventId: LifecycleEventId;
  readonly contribution: string;
  readonly status: "delivered" | "failed";
}

const snapshotCodec = Schema.toCodecIso(LifecycleSnapshot);
const encodeSnapshot = Schema.encodeSync(snapshotCodec);
const decodeSnapshot = Schema.decodeSync(snapshotCodec);
const eventCodec = Schema.toCodecIso(LifecycleEvent);
const encodeEvent = Schema.encodeSync(eventCodec);
const decodeEvent = Schema.decodeSync(eventCodec);

/** Projection also strips undeclared own properties of identifier Schema.Class instances. */
export const lifecycleSnapshot = (input: LifecycleSnapshot): LifecycleSnapshot => {
  try {
    const snapshot = decodeSnapshot(encodeSnapshot(input));

    return Object.freeze({
      ...snapshot,
      identifiers: Object.freeze(
        snapshot.identifiers.map((identifier) => Object.freeze(identifier)),
      ),
    });
  } catch {
    throw HookConfigurationError.make({ reason: "invalid-snapshot", contribution: "snapshot" });
  }
};

export const lifecycleEvent = (input: LifecycleEvent): LifecycleEvent => {
  try {
    const event = decodeEvent(encodeEvent(input));

    return Object.freeze({ ...event, snapshot: lifecycleSnapshot(event.snapshot) });
  } catch {
    throw HookConfigurationError.make({ reason: "invalid-snapshot", contribution: "event" });
  }
};
