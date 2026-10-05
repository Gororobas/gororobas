import { Crypto, Effect, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { TokenDigest } from "../Schema";
import { phoneFailure } from "./failure";
import { PhoneOtpRejected } from "./models";
import { PhoneAdmission } from "./PhoneAdmission";
import { PhoneRequestContext } from "./PhoneRequestContext";

const tuple = Schema.fromJsonString(Schema.Array(Schema.String));

export const phoneDigest = Effect.fn("Phone.digest")(function* (values: ReadonlyArray<string>) {
  const bytes = new TextEncoder().encode(
    yield* Schema.encodeEffect(tuple)(values).pipe(Effect.mapError(phoneFailure)),
  );

  return TokenDigest.make(
    Base64Url.encode(
      yield* (yield* Crypto.Crypto).digest("SHA-256", bytes).pipe(Effect.mapError(phoneFailure)),
    ),
  );
});

/** Trusted network scope is resolved per invocation, including suppressed requests. */
export const phoneAdmission = Effect.fn("Phone.admission")(function* (
  moduleId: string,
  action: "request" | "attempt",
  requestId: string,
  fingerprint: string,
  replayLifetimeMillis = 0,
) {
  const context = yield* PhoneRequestContext;

  return yield* (yield* PhoneAdmission).admit({
    moduleId,
    action,
    requestId,
    fingerprint,
    replayLifetimeMillis,
    networkKey: Redacted.value(context.networkKey),
  });
});

export const phoneAttemptAdmission = Effect.fn("Phone.admitAttempt")(function* (
  moduleId: string,
  flowId: string,
  proofId: string,
) {
  const requestId = yield* (yield* Crypto.Crypto).randomUUIDv4.pipe(Effect.mapError(phoneFailure));

  if (
    !(yield* phoneAdmission(
      moduleId,
      "attempt",
      requestId,
      yield* phoneDigest(["attempt", flowId, proofId]),
    ))
  )
    return yield* PhoneOtpRejected.make({});
});
