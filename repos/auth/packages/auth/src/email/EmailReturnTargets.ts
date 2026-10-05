import { Context, Effect, Layer, Schema } from "effect";

import { EmailConfigurationError, EmailRejected, type EmailUnavailable } from "./errors";
import { SafeReturnTarget } from "./models";

/** Resolve before issuance and again before consumption. Never take a target from
 * email/deep-link data. The core returns this canonical value; it never redirects.
 */
export class EmailReturnTargets extends Context.Service<
  EmailReturnTargets,
  {
    readonly resolve: (
      input: string,
    ) => Effect.Effect<SafeReturnTarget, EmailRejected | EmailUnavailable>;
  }
>()("effect-auth/EmailReturnTargets") {
  /** Explicit exact application-route allowlist; no query, fragment, normalization
   * or fallback to unvalidated input. Consumers may provide a stricter own Layer.
   */
  static readonly exactRoutes = (routes: ReadonlyArray<string>) => {
    const captured = [...routes];

    return Layer.effect(
      this,
      Effect.gen(function* () {
        const route = Schema.String.check(
          Schema.isMaxLength(2048),
          Schema.isPattern(/^\/(?!\/)[A-Za-z0-9/_-]*$/),
        );

        const checked = yield* Schema.decodeEffect(
          Schema.Array(route).check(Schema.isMinLength(1), Schema.isMaxLength(128)),
        )(captured).pipe(Effect.mapError(() => EmailConfigurationError.make({})));

        const allowed = new Set(checked);

        return EmailReturnTargets.of({
          resolve: Effect.fn("EmailReturnTargets.resolve")(function* (input) {
            yield* Schema.decodeEffect(route)(input).pipe(
              Effect.mapError(() => EmailRejected.make({})),
            );
            if (!allowed.has(input)) return yield* EmailRejected.make({});

            return SafeReturnTarget.make(input);
          }),
        });
      }),
    );
  };
}
