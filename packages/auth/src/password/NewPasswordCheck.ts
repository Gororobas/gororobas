import { Cause, Context, Effect, Layer, Redacted, Schema } from "effect";

import { reportAuthFailure } from "../internal/diagnostics";
import {
  CompromisedPasswords,
  PasswordScreening,
  PasswordScreeningContext,
} from "./CompromisedPasswords";
import { NewPasswordRejected, PasswordCheckUnavailable } from "./errors";
import {
  defaultPasswordPolicy,
  validatePasswordPolicy,
  type PasswordNormalization,
  type PasswordPolicy,
} from "./policy";

export interface CheckedNewPassword {
  readonly password: Redacted.Redacted<string>;
  readonly normalization: PasswordNormalization;
}

/** Apply only to new credentials. Persist normalization beside the verifier;
 * login uses that stored mode, while legacy verification/rehash retains none.
 */
export class NewPasswordCheck extends Context.Service<
  NewPasswordCheck,
  {
    readonly check: (
      password: Redacted.Redacted<string>,
      context?: PasswordScreeningContext,
    ) => Effect.Effect<CheckedNewPassword, NewPasswordRejected | PasswordCheckUnavailable>;
  }
>()("effect-auth/NewPasswordCheck") {
  static readonly layer = (input: PasswordPolicy = defaultPasswordPolicy) => {
    const snapshot = { ...input };

    return Layer.effect(
      this,
      Effect.gen(function* () {
        const policy = yield* validatePasswordPolicy(snapshot);
        const screening = (yield* CompromisedPasswords).check;

        return NewPasswordCheck.of({
          check: Effect.fn("NewPasswordCheck.check")(function* (password, context = {}) {
            const checkedContext = Object.freeze(
              yield* Schema.decodeEffect(PasswordScreeningContext)(context).pipe(
                Effect.mapError(() => PasswordCheckUnavailable.make({})),
              ),
            );

            const raw = Redacted.value(password);

            yield* Schema.decodeEffect(
              Schema.String.check(Schema.isMaxLength(policy.maximumBytes)),
            )(raw).pipe(Effect.mapError(() => NewPasswordRejected.make({ reason: "too-long" })));
            yield* Schema.decodeEffect(
              Schema.String.check(Schema.isPattern(/^[^\uD800-\uDFFF]*$/u)),
            )(raw).pipe(Effect.mapError(() => NewPasswordRejected.make({ reason: "ill-formed" })));
            const value = policy.normalization === "NFC" ? raw.normalize("NFC") : raw;
            const length = [...value].length;

            if (
              length < (policy.minimumCodePoints ?? (policy.assurance === "single-factor" ? 15 : 8))
            )
              return yield* NewPasswordRejected.make({ reason: "too-short" });
            if (
              length > policy.maximumCodePoints ||
              new TextEncoder().encode(value).byteLength > policy.maximumBytes
            )
              return yield* NewPasswordRejected.make({ reason: "too-long" });
            const normalized = Redacted.make(value);

            const result = yield* Effect.suspend(() => screening(normalized, checkedContext)).pipe(
              Effect.timeout(policy.screeningTimeoutMillis ?? 10_000),
              Effect.flatMap(Schema.decodeEffect(PasswordScreening)),
              Effect.catchCause((cause) =>
                reportAuthFailure("password-screening", cause).pipe(
                  Effect.andThen(
                    Cause.hasInterrupts(cause)
                      ? Effect.failCause(
                          Cause.fromReasons<never>(cause.reasons.filter(Cause.isInterruptReason)),
                        )
                      : Effect.fail(PasswordCheckUnavailable.make({})),
                  ),
                ),
              ),
            );

            if (result._tag === "Rejected")
              return yield* NewPasswordRejected.make({ reason: result.reason });

            return Object.freeze({ password: normalized, normalization: policy.normalization });
          }),
        });
      }),
    );
  };
}
