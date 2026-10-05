import { Context, Effect, Layer, Schema } from "effect";

import { OAuthConfigurationError, OAuthRejected, type OAuthUnavailable } from "./signInErrors";
import { OAuthReturnTarget } from "./signInModels";

/** Application authority; resolve before issuance and retain that exact route.
 * The callback cannot select a replacement. Core never performs redirects. */
export class OAuthReturnTargets extends Context.Service<
  OAuthReturnTargets,
  {
    readonly resolve: (
      input: string,
    ) => Effect.Effect<typeof OAuthReturnTarget.Type, OAuthRejected | OAuthUnavailable>;
  }
>()("effect-auth/OAuthReturnTargets") {
  static readonly exactRoutes = (routes: ReadonlyArray<string>) => {
    const captured = [...routes];

    return Layer.effect(
      this,
      Effect.gen(function* () {
        const checked = yield* Schema.decodeEffect(
          Schema.Array(OAuthReturnTarget).check(Schema.isMinLength(1), Schema.isMaxLength(128)),
        )(captured).pipe(
          Effect.mapError(() => OAuthConfigurationError.make({ reason: "return-target" })),
        );

        const allowed = new Set<string>(checked);

        return OAuthReturnTargets.of({
          resolve: Effect.fn("OAuthReturnTargets.resolve")(function* (input) {
            const target = yield* Schema.decodeEffect(OAuthReturnTarget)(input).pipe(
              Effect.mapError(() => OAuthRejected.make({})),
            );

            if (!allowed.has(target)) return yield* OAuthRejected.make({});

            return target;
          }),
        });
      }),
    );
  };
}
