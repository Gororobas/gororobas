import {
  PasskeyAuthenticationStarted,
  PasskeyRegistrationStarted,
  snapshotPasskey,
} from "@yielded/auth/Passkey";
import { reportAuthFailure } from "@yielded/auth/Persistence";
import { Cause, DateTime, Effect, Layer, Predicate, Redacted, Schema } from "effect";
import { Platform } from "react-native";
import { Passkey, type PasskeyCreateRequest, type PasskeyGetRequest } from "react-native-passkey";

import {
  PasskeyReactNativeAuthentication,
  PasskeyReactNativeBusy,
  type PasskeyReactNativeFailure,
  PasskeyReactNativeInputRejected,
  PasskeyReactNativeInvalidResponse,
  PasskeyReactNativeNotCompleted,
  PasskeyReactNativeRegistration,
  PasskeyReactNativeUnavailable,
  PasskeyReactNativeUnsupported,
} from "./models";
import { PasskeyReactNative } from "./PasskeyReactNative";
import {
  authenticationWire,
  nativeAuthentication,
  nativeRegistration,
  registrationWire,
} from "./wire";

type Native = PasskeyReactNative["Service"];
const unavailable = () => new PasskeyReactNativeUnavailable({});
const rejected = () => new PasskeyReactNativeInputRejected({});
const invalid = () => new PasskeyReactNativeInvalidResponse({});
const timedOut = () => new PasskeyReactNativeNotCompleted({ reason: "timed-out" });

const redactDefects =
  <Failure>(failure: () => Failure) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.catchCause((cause): Effect.Effect<never, E | Failure> =>
        Cause.hasDies(cause)
          ? reportAuthFailure("passkey-react-native", cause).pipe(
              Effect.andThen(Effect.fail(failure())),
            )
          : Effect.failCause(cause),
      ),
    );

const unexpected = redactDefects(unavailable);

const timeout = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 300000 }));

const registrationInput = Schema.Struct({
  ...PasskeyRegistrationStarted.fields,
  options: Schema.Struct({ ...PasskeyRegistrationStarted.fields.options.fields, timeout }),
});

const authenticationInput = Schema.Struct({
  started: Schema.Struct({
    ...PasskeyAuthenticationStarted.fields,
    options: Schema.Struct({ ...PasskeyAuthenticationStarted.fields.options.fields, timeout }),
  }),
  mediation: Schema.Literals(["required", "conditional"]),
});

const environment = Effect.sync(() => {
  if (Platform.OS !== "ios") return { supported: false, exclusions: false };

  // The maintained helper only checks OS version (and includes iOS 15).
  // Decode platform metadata before applying this adapter's iOS 16 minimum.
  // eslint-disable-next-line no-restricted-properties
  const version = Schema.decodeUnknownSync(
    Schema.String.check(Schema.isPattern(/^\d+(?:\.\d+){0,2}$/)),
  )(Platform.Version);

  const [major = 0, minor = 0] = version.split(".").map(Number);
  // eslint-disable-next-line no-restricted-properties
  const supported = Schema.decodeUnknownSync(Schema.Boolean)(Passkey.isSupported());

  return {
    supported: major >= 16 && supported,
    exclusions: major > 17 || (major === 17 && minor >= 4),
  };
}).pipe(unexpected);

interface Lease {
  phase: "pre-native" | "native" | "settled";
  listening: boolean;
}
// The peer has one native resolver. Coordinate every instance of this installed
// module; callers must not also use the peer directly or load duplicate copies.
let activeLease: Lease | undefined;

const settle = (lease: Lease): void => {
  lease.phase = "settled";
  if (activeLease === lease) activeLease = undefined;
};

const acquire = Effect.gen(function* () {
  if (activeLease !== undefined) return yield* new PasskeyReactNativeBusy({});
  const lease: Lease = { phase: "pre-native", listening: true };

  activeLease = lease;

  return lease;
});

const release = (lease: Lease) =>
  Effect.sync(() => {
    lease.listening = false;
    // There is no cancel API. Free only a request that has not reached native.
    if (lease.phase === "pre-native") settle(lease);
  });

const nativeFailure = (value: unknown): Effect.Effect<never, PasskeyReactNativeFailure> =>
  Effect.suspend((): Effect.Effect<never, PasskeyReactNativeFailure> => {
    if (!Predicate.isObject(value)) return Effect.die(value);
    // Inspect only the normalized code; never copy message, native stack, or cause.
    // eslint-disable-next-line no-restricted-properties
    const code = Schema.decodeUnknownOption(Schema.String)(value.error);

    if (code._tag === "None") return Effect.die(value);
    switch (code.value) {
      case "NotSupported":
        return Effect.fail(new PasskeyReactNativeUnsupported({}));
      case "InvalidChallenge":
      case "InvalidUserId":
        return Effect.fail(rejected());
      case "UserCancelled":
        return Effect.fail(new PasskeyReactNativeNotCompleted({ reason: "cancelled" }));
      case "NoCredentials":
        return Effect.fail(new PasskeyReactNativeNotCompleted({ reason: "no-credentials" }));
      case "CredentialAlreadyExists":
        return Effect.fail(new PasskeyReactNativeNotCompleted({ reason: "credential-exists" }));
      case "Interrupted":
        return Effect.fail(new PasskeyReactNativeNotCompleted({ reason: "interrupted" }));
      case "TimedOut":
        return Effect.fail(timedOut());
      case "RequestFailed":
        return Effect.fail(new PasskeyReactNativeNotCompleted({ reason: "request-failed" }));
      default:
        return Effect.die(value);
    }
  });

const native = (lease: Lease, call: () => Promise<unknown>) =>
  Effect.callback<unknown, PasskeyReactNativeFailure>((resume, signal) => {
    if (
      signal.aborted ||
      !lease.listening ||
      lease.phase !== "pre-native" ||
      activeLease !== lease
    ) {
      resume(Effect.die(new Error("Invalid passkey native lease")));

      return;
    }
    lease.phase = "native";
    try {
      // The caller owns classification and diagnostic reporting. Callbacks only
      // settle the guard and resume a live caller. After interruption they discard
      // the outcome without inspecting it or retaining/running a scoped logger.
      void Promise.resolve(call()).then(
        (value) => {
          try {
            settle(lease);
            if (!signal.aborted && lease.listening) resume(Effect.succeed(value));
          } catch {
            /* A detached handler must not reject. */
          }
        },
        (error) => {
          try {
            settle(lease);
            if (!signal.aborted && lease.listening) resume(nativeFailure(error));
          } catch {
            /* A detached handler must not reject. */
          }
        },
      );
    } catch (error) {
      settle(lease);
      resume(Effect.die(error));
    }
  });

const remaining = Effect.fnUntraced(function* (deadline: number) {
  const duration = deadline - DateTime.toEpochMillis(yield* DateTime.now);

  if (duration <= 0) return yield* timedOut();

  return Math.max(1, Math.floor(duration));
});

const runCeremony = Effect.fnUntraced(function* <A>(
  started: { readonly expiresAtMillis: number; readonly options: { readonly timeout: number } },
  use: (lease: Lease, deadline: number) => Effect.Effect<A, PasskeyReactNativeFailure>,
) {
  const now = DateTime.toEpochMillis(yield* DateTime.now);

  if (started.expiresAtMillis <= now) return yield* rejected();
  const deadline = Math.min(started.expiresAtMillis, now + started.options.timeout);

  return yield* Effect.scoped(
    Effect.gen(function* () {
      const lease = yield* Effect.acquireRelease(acquire, release);
      const duration = yield* remaining(deadline);

      return yield* use(lease, deadline).pipe(
        Effect.timeoutOrElse({ duration, orElse: () => Effect.fail(timedOut()) }),
      );
    }),
  );
});

const decodeResponse = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  value: unknown,
) =>
  // Peer declarations are not validation. Parse bounded base64url fields and
  // discard unknown fields before constructing the server's JSON envelope.
  // eslint-disable-next-line no-restricted-properties
  Schema.decodeUnknownEffect(schema)(value).pipe(Effect.mapError(invalid), redactDefects(invalid));

/** Creates the iOS adapter. Ceremonies own their scopes; construction performs no native I/O. */
export const make = (): Effect.Effect<Native> =>
  Effect.sync(() => {
    const register = Effect.fnUntraced(function* (input: Parameters<Native["register"]>[0]) {
      const started = yield* snapshotPasskey(registrationInput, input).pipe(
        Effect.mapError(rejected),
      );

      const env = yield* environment;

      if (
        !env.supported ||
        !started.options.pubKeyCredParams.some(({ alg }) => alg === -7) ||
        (started.options.excludeCredentials.length > 0 && !env.exclusions)
      )
        return yield* new PasskeyReactNativeUnsupported({});

      return yield* runCeremony(started, (lease, deadline) =>
        Effect.gen(function* () {
          const options = started.options;

          const request: PasskeyCreateRequest = {
            ...options,
            rp: { ...options.rp },
            user: { ...options.user },
            authenticatorSelection: { ...options.authenticatorSelection },
            pubKeyCredParams: options.pubKeyCredParams.map((value) => ({ ...value })),
            excludeCredentials: options.excludeCredentials.map((value) => ({ ...value })),
            timeout: yield* remaining(deadline),
          };

          // The platform path preserves the required attestation: "none" policy.
          const credential = yield* decodeResponse(
            nativeRegistration,
            yield* native(lease, () => Passkey.createPlatformKey(request)),
          );

          const response = yield* Schema.encodeEffect(registrationWire)({
            id: credential.id,
            rawId: credential.rawId,
            type: "public-key",
            response: credential.response,
            clientExtensionResults: {},
          }).pipe(Effect.mapError(invalid));

          yield* remaining(deadline);

          return yield* snapshotPasskey(PasskeyReactNativeRegistration, {
            flowId: started.flowId,
            response: Redacted.make(response),
          }).pipe(Effect.mapError(invalid));
        }),
      );
    }, unexpected);

    const authenticate = Effect.fnUntraced(function* (
      input: Parameters<Native["authenticate"]>[0],
    ) {
      const { started, mediation } = yield* snapshotPasskey(authenticationInput, input).pipe(
        Effect.mapError(rejected),
      );

      if (mediation === "conditional" || !(yield* environment).supported)
        return yield* new PasskeyReactNativeUnsupported({});

      return yield* runCeremony(started, (lease, deadline) =>
        Effect.gen(function* () {
          const request: PasskeyGetRequest = {
            ...started.options,
            allowCredentials: started.options.allowCredentials.map((value) => ({ ...value })),
            timeout: yield* remaining(deadline),
          };

          const credential = yield* decodeResponse(
            nativeAuthentication,
            yield* native(lease, () => Passkey.get(request)),
          );

          const { userHandle, ...responseFields } = credential.response;

          const response = yield* Schema.encodeEffect(authenticationWire)({
            id: credential.id,
            rawId: credential.rawId ?? credential.id,
            type: "public-key",
            response: {
              ...responseFields,
              ...(userHandle === null || userHandle === undefined ? {} : { userHandle }),
            },
            clientExtensionResults: {},
          }).pipe(Effect.mapError(invalid));

          yield* remaining(deadline);

          return yield* snapshotPasskey(PasskeyReactNativeAuthentication, {
            flowId: started.flowId,
            response: Redacted.make(response),
          }).pipe(Effect.mapError(invalid));
        }),
      );
    }, unexpected);

    return PasskeyReactNative.of({
      register,
      authenticate,
      capabilities: environment.pipe(
        Effect.map(({ supported }) => ({
          supported,
          conditionalGet: "unsupported" as const,
          cancellation: "unsupported" as const,
        })),
      ),
    });
  });

export const layer: Layer.Layer<PasskeyReactNative> = Layer.effect(PasskeyReactNative, make());
