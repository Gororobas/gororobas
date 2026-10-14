import * as AuthAtom from "@yielded/auth/Atom";
import * as Client from "@yielded/auth/Client";
import { Effect, Redacted } from "effect";
import { AtomRegistry, AsyncResult } from "effect/reactivity";

import { OAuthSignInApi } from "./oauth-contract";

const AppClient = Client.make(OAuthSignInApi, { baseUrl: location.origin });
const auth = AuthAtom.make(AppClient);

const login = auth.runtime.fn<{ readonly provider: string; readonly returnTarget: string }>()(
  Effect.fn("example.oauthLogin")(function* (input) {
    const client = yield* AppClient;
    const authorization = yield* client.auth.signIn(input);

    yield* Effect.sync(() => location.assign(Redacted.value(authorization.authorizationUrl)));
  }),
);

const registry = AtomRegistry.make();
const button = document.querySelector("button");
const status = document.querySelector("output");

registry.subscribe(login, (result) => {
  if (button) button.disabled = result.waiting;
  if (status)
    status.textContent = AsyncResult.isFailure(result) ? "Sign-in failed. Please try again." : "";
});
button?.addEventListener("click", () =>
  registry.set(login, {
    provider: document.body.dataset.provider ?? "",
    returnTarget: document.body.dataset.returnTarget ?? "/account",
  }),
);
addEventListener("pagehide", () => registry.dispose());
