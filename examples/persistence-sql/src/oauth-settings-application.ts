import { Hooks, Http, OAuth } from "@yielded/auth";
import { Effect, Layer, type Redacted } from "effect";
import { FetchHttpClient } from "effect/http";

import { CryptoLive } from "../../shared/crypto";
import { SettingsActionsLive, SettingsAuth } from "./oauth-settings-auth";
import { providerLayer } from "./oauth-settings-provider";
import { settingsStorage } from "./oauth-settings-storage";

export interface SettingsConfiguration {
  readonly origin: URL;
  readonly clientId: string;
  readonly clientSecret: Redacted.Redacted<string>;
  readonly externalSubject: string;
  readonly displayName: string;
}

/** The host supplies the SQL owner and stable keys; all auth policy is shared. */
export const settingsApplication = (config: SettingsConfiguration) => {
  const secure = config.origin.protocol === "https:";
  const prefix = `${secure ? "__Host-" : ""}oauth-settings-`;

  const http = Http.make(SettingsAuth, {
    origin: config.origin.origin,
    cookie: { prefix, secure },
  });

  const infrastructure = Layer.mergeAll(
    Hooks.LifecycleHooks.empty,
    providerLayer(config),
    OAuth.OAuthReturnTargets.exactRoutes(["/oauth-settings"]),
    Layer.succeed(SettingsAuth.strategies.oauth.SessionClaims, {
      resolve: () => Effect.succeed({ displayName: config.displayName }),
    }),
  ).pipe(Layer.provideMerge(CryptoLive), Layer.provideMerge(FetchHttpClient.layer));

  const storage = settingsStorage(config.externalSubject).pipe(Layer.provideMerge(infrastructure));

  const live = SettingsAuth.layer.pipe(
    Layer.provide(SettingsActionsLive.pipe(Layer.provideMerge(storage))),
  );

  return http.routes().pipe(Layer.provide(live), Layer.provide(infrastructure));
};
