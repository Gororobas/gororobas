import { Cause, Context, Effect } from "effect";

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
  | "session-sign-out"
  | "password-screening"
  | "password-hashing"
  | "auth-persistence"
  | "passkey-core"
  | "passkey-react-native"
  | "passkey-protocol";

/** Keep Effect's content-free frames, never failure values or arbitrary annotations. */
export const reportAuthFailure = Effect.fn("AuthDiagnostics.reportFailure")(function* <E>(
  stage: FailureStage,
  cause: Cause.Cause<E>,
): Effect.fn.Return<void> {
  if (cause.reasons.length === 0 || Cause.hasInterruptsOnly(cause)) return;

  const diagnostic = Cause.fromReasons(
    cause.reasons.map((reason) => {
      const error = new globalThis.Error(`Auth ${stage} failed`);

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

  yield* Effect.logError("Auth boundary failed", diagnostic);
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
