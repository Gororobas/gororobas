import { Effect, type Crypto } from "effect";
import type { HttpClient } from "effect/http";

import { selectCallback } from "../../callback";
import { wipeConnectedMaterial } from "../../grantTokens";
import { OAuthConnectedProtocol } from "../../OAuthConnectedProtocol";
import type { ProviderDefinition } from "../../providerDefinition";
import { OAuthUnavailable, OAuthConfigurationError } from "../../signInErrors";
import { OAuthCallbackId } from "../../signInModels";
import { accessProfile } from "./access";
import { providerKey, type ProviderOptions } from "./models";
import { makeConnectedProtocol } from "./protocol";

export const provider = (
  input: ProviderOptions,
): ProviderDefinition<OAuthConfigurationError, HttpClient.HttpClient | Crypto.Crypto> => {
  const options = { ...input };

  return {
    configure: Effect.fn("Strava.provider")(function* (binding) {
      if (binding.provider !== providerKey)
        return yield* OAuthConfigurationError.make({ reason: "policy" });

      const profile =
        options.access ?? accessProfile({ clientId: options.clientId, scopes: ["read"] });

      const configured = yield* Effect.forEach(binding.callbacks, (callback) =>
        Effect.map(makeConnectedProtocol(options, profile, callback), (protocol) => ({
          ...callback,
          protocol,
        })),
      );

      const connected = OAuthConnectedProtocol.of({
        prepareAuthorization: (input) =>
          selectCallback(providerKey, configured, input.callbackId)?.protocol.prepareAuthorization(
            input,
          ) ?? OAuthUnavailable.make({}),
        exchangeGrant: (input) =>
          selectCallback(
            providerKey,
            configured,
            input.configuration.callbackId,
          )?.protocol.exchangeGrant(input) ?? OAuthUnavailable.make({}),
        refreshGrant: (input) =>
          selectCallback(
            providerKey,
            configured,
            input.context.configuration.callbackId,
          )?.protocol.refreshGrant(input) ?? OAuthUnavailable.make({}),
        revokeGrant: (input) =>
          selectCallback(
            providerKey,
            configured,
            input.context.configuration.callbackId,
          )?.protocol.revokeGrant(input) ?? OAuthUnavailable.make({}),
      });

      return {
        prepareAuthorization: (input) =>
          connected
            .prepareAuthorization({
              ...input,
              profile,
              callbackId: input.callbackId ?? OAuthCallbackId.make(providerKey),
            })
            .pipe(
              Effect.mapError((error) =>
                error._tag === "OAuthProtocolRejected" ? OAuthUnavailable.make({}) : error,
              ),
            ),
        exchangeVerifiedIdentity: (input) =>
          connected
            .exchangeGrant({ ...input, configuration: { ...input.configuration, profile } })
            .pipe(
              Effect.map((grant) => {
                wipeConnectedMaterial(grant.material);

                return {
                  identity: grant.identity,
                  ...(grant.profile === undefined ? {} : { profile: grant.profile }),
                };
              }),
            ),
        ...(options.access === undefined ? {} : { connected }),
      };
    }),
  };
};
