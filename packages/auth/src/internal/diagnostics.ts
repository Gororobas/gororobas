import { Cause, Console, Context, Effect, References, Schema, Tracer } from "effect";

export const AuthDiagnostic = Schema.Struct({
  stage: Schema.Literals([
    "session-verification",
    "session-timeline",
    "session-authority",
    "persistence-initialization",
    "persistence-validation",
    "oauth-exchange",
    "oauth-completion",
    "oauth-registration",
  ]),
  reason: Schema.Literals([
    "invalid-evidence",
    "chronology",
    "future-issued",
    "expired",
    "lifetime",
    "configuration",
    "mapping",
    "authority-rejected",
    "rejected",
    "unavailable",
    "timeout",
  ]),
});

export type AuthDiagnostic = typeof AuthDiagnostic.Type;

/** Only fixed fields enter diagnostics; logging defects cannot change authentication. */
export const reportAuthDiagnostic = Effect.fnUntraced(
  function* (stage: AuthDiagnostic["stage"], reason: AuthDiagnostic["reason"]) {
    const diagnostic = yield* Schema.decodeEffect(AuthDiagnostic)({ stage, reason });

    yield* Effect.logDebug("Auth diagnostic", diagnostic);
  },
  Effect.catch(() => Effect.void),
  Effect.catchDefect(() => Effect.void),
);

/** Captured dependencies win; logging and tracing belong to the invoking fiber. */
export const withoutObservability = <R>(context: Context.Context<R>): Context.Context<R> =>
  Context.omit(
    Tracer.ParentSpan,
    Tracer.Tracer,
    Tracer.CurrentTraceLevel,
    Tracer.MinimumTraceLevel,
    Console.Console,
    References.CurrentLoggers,
    References.CurrentLogLevel,
    References.MinimumLogLevel,
    References.LogToStderr,
    References.CurrentLogAnnotations,
    References.CurrentLogSpans,
    References.CurrentStackFrame,
    References.TracerEnabled,
    References.TracerTimingEnabled,
    References.TracerSpanAnnotations,
    References.TracerSpanLinks,
  )(context) as Context.Context<R>;

type FailureStage =
  | "local"
  | "rpc"
  | "http"
  | "success-projection"
  | "error-projection"
  | "private-output"
  | "after-hook"
  | "proof-delivery"
  | "oauth-sign-in"
  | "oauth-accounts"
  | "oauth-exchange"
  | "oauth-protocol"
  | "oauth-identity"
  | "oauth-connected"
  | "oauth-registration"
  | "session-crypto"
  | "session-cache"
  | "session-sign-out"
  | "password-screening"
  | "password-hashing"
  | "password-limiting"
  | "auth-persistence"
  | "passkey-core"
  | "passkey-react-native"
  | "passkey-protocol";

/** Fixed diagnostic text only; never includes the reported cause or caller data. */
class AuthReportedFailure extends Schema.TaggedError<AuthReportedFailure>()("AuthReportedFailure", {
  message: Schema.String,
}) {}

/** Keep Effect's content-free frames, never failure values or arbitrary annotations. */
export const reportAuthFailure = Effect.fn("AuthDiagnostics.reportFailure")(function* <E>(
  stage: FailureStage,
  cause: Cause.Cause<E>,
): Effect.fn.Return<void> {
  if (cause.reasons.length === 0 || Cause.hasInterruptsOnly(cause)) return;

  const diagnostic = Cause.fromReasons(
    cause.reasons.map((reason) => {
      const error = AuthReportedFailure.make({ message: `Auth ${stage} failed` });

      const safe = Cause.isDieReason(reason)
        ? Cause.makeDieReason(error)
        : Cause.isFailReason(reason)
          ? Cause.makeFailReason(error)
          : Cause.makeInterruptReason(reason.fiberId);

      // Effect.fn / span names must themselves remain free of request content.
      const frame = Context.getOrUndefined(Cause.reasonAnnotations(reason), Cause.StackTrace);

      return frame === undefined ? safe : safe.annotate(Context.make(Cause.StackTrace, frame));
    }),
  );

  yield* Effect.logError("Auth boundary failed", diagnostic).pipe(
    Effect.catchDefect(() => Effect.void),
  );
});

/** Report only terminal unexpected persistence reasons, preserving the original Cause. */
export const reportPersistenceFailure = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  isExpected: (error: E) => boolean,
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.catchCause((cause): Effect.Effect<never, E> => {
      const reasons = cause.reasons.filter(
        (reason) =>
          Cause.isDieReason(reason) || (Cause.isFailReason(reason) && !isExpected(reason.error)),
      );

      if (reasons.length === 0) return Effect.failCause(cause);

      return reportAuthFailure("auth-persistence", Cause.fromReasons(reasons)).pipe(
        Effect.andThen(Effect.failCause(cause)),
      );
    }),
  );
