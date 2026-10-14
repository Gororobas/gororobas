import { Effect, Schema } from "effect";

import type { ProviderDefinition } from "../../providerDefinition";
import type { OAuthUnavailable } from "../../signInErrors";
import { provider, type ProviderRegistration } from "./layer";
import { OpenIdConnectConfigurationError } from "./models";
import type { Requirements } from "./oidc";
import { resolveOptions } from "./options";

export const OidcPresetRegistration = Schema.Struct({
  clientId: Schema.NonEmptyString,
  clientSecret: Schema.toType(Schema.RedactedFromValue(Schema.NonEmptyString)),
  configurationGeneration: Schema.optionalKey(Schema.Int),
  issuance: Schema.optionalKey(Schema.Literals(["active", "retired"])),
  scopes: Schema.optionalKey(Schema.Array(Schema.Literals(["openid", "profile", "email"]))),
});

export type OidcPresetOptions<Registration extends object> = {
  /** Per-request timeout in seconds, from 1 to 30. Defaults to 10. */
  readonly timeoutSeconds?: number;
} & (Registration | { readonly registrations: ReadonlyArray<Registration> });

/** Validate preset input before applying its pure provider-specific configuration.
 * Configuration stays lazy so invalid input fails through the host's Layer. */
export const makeOidcPreset = <Registration extends object>(
  options: OidcPresetOptions<Registration>,
  registration: Schema.Codec<Registration, Registration>,
  toProvider: (
    registration: Registration,
  ) => Extract<ProviderRegistration, { readonly protocol: "oidc" }>,
): ProviderDefinition<OpenIdConnectConfigurationError | OAuthUnavailable, Requirements> => ({
  configure: (binding) =>
    resolveOptions(() =>
      Effect.gen(function* () {
        const registrations = yield* Schema.decodeEffect(Schema.Array(registration))(
          "registrations" in options ? options.registrations : [options],
        ).pipe(Effect.mapError(() => OpenIdConnectConfigurationError.make({ reason: "provider" })));

        return yield* provider({
          registrations: registrations.map(toProvider),
          ...(options.timeoutSeconds === undefined
            ? {}
            : { timeoutSeconds: options.timeoutSeconds }),
        }).configure(binding);
      }),
    ),
});
