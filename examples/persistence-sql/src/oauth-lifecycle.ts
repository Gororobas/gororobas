import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Auth, Hooks, OAuth } from "@yielded/auth";
import { Console, Effect, Layer, Redacted } from "effect";

import { CryptoLive } from "../../shared/crypto";
import { DatabaseLive } from "./data";
import { DemoActionsLive } from "./oauth-demo-actions";
import { DemoHttpLive, DemoProviderLive } from "./oauth-demo-provider";
import { exercise, reopen } from "./oauth-lifecycle-consumer";
import { AppAuth, keys } from "./oauth-lifecycle-model";
import { LifecycleStorageLive } from "./oauth-lifecycle-storage";

const storage = DemoActionsLive.pipe(Layer.provideMerge(LifecycleStorageLive));

const live = Layer.mergeAll(AppAuth.layer, AppAuth.strategies.oauth.access.accessLayer).pipe(
  Layer.provideMerge(storage),
  Layer.provide(DemoProviderLive),
  Layer.provide(
    Layer.mergeAll(
      Auth.AuthConfig.layer({
        // Public demo secret, stable across this disposable example's runtimes.
        secret: Redacted.make("public-sql-oauth-example-application-secret"),
      }),
      Auth.RequestBindingConfig.layer({ generation: 1, lifetimeMillis: 600_000, keyring: keys(2) }),
      OAuth.OAuthTransactionProtector.layer(keys(2)),
      OAuth.OAuthLinkTransactionProtector.layer(keys(2)),
      OAuth.OAuthConnectedTransactionProtector.layer(keys(2)),
      OAuth.OAuthConnectedTokenProtector.layer(keys(3)),
      OAuth.OAuthReturnTargets.exactRoutes(["/account"]),
      Layer.succeed(AppAuth.strategies.oauth.SessionClaims, {
        resolve: () => Effect.succeed({ role: "member" as const }),
      }),
      Layer.succeed(AppAuth.strategies.registration.SessionClaims, {
        resolve: () => Effect.succeed({ role: "member" as const }),
      }),
    ),
  ),
  Layer.provideMerge(DemoHttpLive),
  Layer.provideMerge(DatabaseLive),
  Layer.provide(Hooks.LifecycleHooks.empty),
  Layer.provideMerge(CryptoLive),
  Layer.provide(BunServices.layer),
);

Effect.gen(function* () {
  yield* Console.log(
    "Direct Effect SQL OAuth lifecycle; native Strava protocol, simulated provider HTTP and private action-code delivery.",
  );
  const saved = yield* exercise.pipe(Effect.provide(live));

  yield* reopen(saved).pipe(Effect.provide(live));
}).pipe(BunRuntime.runMain);
