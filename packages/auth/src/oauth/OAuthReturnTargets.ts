import { Context, Effect, Layer, Schema } from "effect";

import { exactReturnTargets } from "../internal/return-target";
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
  /** Exact paths or absolute HTTPS URLs on explicitly trusted origins. No query,
   * fragment, wildcard, normalization or prefix matching. Share trustedOrigins
   * with Http configuration; HTTP mutation admission remains independent. */
  static readonly exactRoutes = (
    routes: ReadonlyArray<string>,
    options?: { readonly trustedOrigins: ReadonlyArray<string> },
  ) => {
    const allowed = exactReturnTargets(routes, options?.trustedOrigins ?? []).pipe(
      Effect.mapError(() => OAuthConfigurationError.make({ reason: "return-target" })),
    );

    return Layer.effect(
      this,
      Effect.gen(function* () {
        const checked = yield* allowed;

        return OAuthReturnTargets.of({
          resolve: Effect.fn("OAuthReturnTargets.resolve")(function* (input) {
            if (!checked.has(input)) return yield* OAuthRejected.make({});

            return yield* Schema.decodeEffect(OAuthReturnTarget)(input).pipe(
              Effect.mapError(() => OAuthRejected.make({})),
            );
          }),
        });
      }),
    );
  };
}
