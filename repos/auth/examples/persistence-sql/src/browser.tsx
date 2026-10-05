import { Effect, Layer } from "effect";
import { KeyValueStore } from "effect/persistence";
import { AtomRegistry } from "effect/reactivity";

import { mountAccountApp } from "../../shared/account/browser";
import { minimumPasswordLength } from "../../shared/account/contract";
import {
  AccountAuthentication,
  BrowserLoginBanner,
  returningToApp,
  makeBrowserLogin,
} from "./browser-login-banner";
import { makeClient } from "./client";

const account = makeClient(
  { baseUrl: window.location.origin },
  KeyValueStore.layerStorage(() => window.sessionStorage),
);

const AuthenticationLive = Layer.effect(
  AccountAuthentication,
  Effect.gen(function* () {
    const registry = yield* AtomRegistry.AtomRegistry;

    return AccountAuthentication.of({
      session: AtomRegistry.getResult(registry, account.auth.session, { suspendOnWaiting: true }),
      createAccount: Effect.fnUntraced(function* (input) {
        registry.set(account.createAccount, input);

        return yield* AtomRegistry.getResult(registry, account.createAccount, {
          suspendOnWaiting: true,
        });
      }),
      signIn: Effect.fnUntraced(function* (input) {
        registry.set(account.signIn, input);

        return yield* AtomRegistry.getResult(registry, account.signIn, { suspendOnWaiting: true });
      }),
      signInWithPasskey: Effect.fnUntraced(function* () {
        registry.set(account.signInWithPasskey, undefined);

        return yield* AtomRegistry.getResult(registry, account.signInWithPasskey, {
          suspendOnWaiting: true,
        });
      }),
    });
  }),
);

const login = makeBrowserLogin(AuthenticationLive);
const client = returningToApp ? { ...account, ...login } : account;

mountAccountApp(client, {
  number: "03",
  description: "Effect SQL example",
  minimumPasswordLength,
  banner: <BrowserLoginBanner client={client} login={login} />,
  returnToApp: returningToApp,
});
