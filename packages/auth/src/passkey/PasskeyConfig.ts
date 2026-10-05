import { Context, Effect, Layer, Schema } from "effect";

import { PasskeyConfigurationError } from "./errors";
import { PasskeyProfile } from "./models";

const Configuration = Schema.Struct({ profiles: Schema.NonEmptyArray(PasskeyProfile) });

/** Shared host configuration for ceremonies and the protocol adapter. No implicit origin trust. */
export class PasskeyConfig extends Context.Service<PasskeyConfig, typeof Configuration.Type>()(
  "effect-auth/PasskeyConfig",
) {
  static readonly layer = (
    configuration:
      | typeof Configuration.Type
      | {
          readonly id: string;
          readonly name: string;
          readonly origins: ReadonlyArray<string>;
          readonly developmentLocalhost?: boolean;
        },
  ) =>
    Layer.effect(
      PasskeyConfig,
      Effect.gen(function* () {
        const value =
          "profiles" in configuration
            ? configuration
            : {
                profiles: [
                  {
                    profileId: "default",
                    generation: 1,
                    rpId: configuration.id,
                    rpName: configuration.name,
                    origins: configuration.origins,
                    developmentLocalhost: configuration.developmentLocalhost ?? false,
                    residentKey: "required",
                    userVerification: "required",
                    primarySignIn: true,
                    attestation: "none",
                    algorithms: [-7, -257],
                  },
                ],
              };

        return yield* Schema.decodeUnknownEffect(Configuration)(value).pipe(
          Effect.mapError(() => PasskeyConfigurationError.make({})),
        );
      }),
    );
}
