import { RegistryProvider, useAtom, useAtomValue } from "@effect/atom-react";
import { Effect } from "effect";
import { createElement } from "react";

import { AppClient, auth } from "./auth-client";

// Usually import auth directly. Explicit props also support request-local SSR bindings.
export function MemberPanel(props: { readonly auth?: typeof auth }) {
  const atoms = props.auth ?? auth;
  const session = useAtomValue(atoms.session);
  const [signOutResult, signOut] = useAtom(atoms.signOut);

  if (session._tag === "Initial") return createElement("p", null, "Loading session…");
  if (session._tag === "Failure")
    return createElement("p", { role: "alert" }, "Session unavailable.");
  if (session.value === null) return createElement("p", null, "Signed out.");

  return createElement(
    "section",
    null,
    createElement("p", null, `Hello, ${session.value.claims.displayName}.`),
    createElement(
      "button",
      { type: "button", disabled: signOutResult.waiting, onClick: () => signOut(undefined) },
      "Sign out",
    ),
  );
}

// Use the application's existing registry when it already has one.
export function BrowserApp() {
  return createElement(RegistryProvider, null, createElement(MemberPanel));
}

// Run through the same auth runtime when sharing the browser instance, or
// provide AppClient.layerFetch at a separate program boundary for a fresh client.
export const signOutFromEffect = Effect.fn("example.signOutFromEffect")(function* () {
  const client = yield* AppClient;

  return yield* client.auth.signOut();
});
