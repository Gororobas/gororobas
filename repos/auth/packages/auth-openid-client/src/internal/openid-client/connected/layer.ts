import { OAuthConnectedProtocol } from "@yielded/auth/OAuth";
import { Effect, Layer } from "effect";

import { resolveOptions, resolveProvider, type ProviderOptions } from "../options";
import type {
  OpenIdClientConnectedOAuthProvider,
  OpenIdClientConnectedOidcProvider,
} from "./models";
import { makeOpenIdClientConnectedProtocol } from "./protocol";

export type Provider<R = never> = ProviderOptions<
  OpenIdClientConnectedOidcProvider | OpenIdClientConnectedOAuthProvider<R>
>;

export interface Options<R = never> {
  readonly providers: ReadonlyArray<Provider<R>>;
  /** Per-request timeout in seconds, from 1 to 30. Defaults to 10. */
  readonly timeoutSeconds?: number;
}

/** Connected grants with the same registration/authentication defaults as
 * OpenIdClient.layer. Profiles, resource indicators, refresh and revocation
 * contracts remain explicit because they describe the host's grant authority.
 * Retain retired configuration generations while grants still reference them. */
export const layer = <R = never>(options: Options<R>) =>
  Layer.effect(
    OAuthConnectedProtocol,
    resolveOptions(() => ({
      providers: options.providers.map((input) =>
        input.protocol === "oidc"
          ? {
              ...resolveProvider(input),
              idTokenSignedResponseAlg:
                input.idTokenSignedResponseAlg === undefined
                  ? ("RS256" as const)
                  : input.idTokenSignedResponseAlg,
            }
          : {
              ...resolveProvider(input),
              pkceS256: input.pkceS256 === undefined ? (true as const) : input.pkceS256,
            },
      ),
      timeoutSeconds: options.timeoutSeconds === undefined ? 10 : options.timeoutSeconds,
    })).pipe(Effect.flatMap(makeOpenIdClientConnectedProtocol<R>)),
  );
