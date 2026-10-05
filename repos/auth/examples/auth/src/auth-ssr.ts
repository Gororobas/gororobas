import { RegistryContext } from "@effect/atom-react";
import { Atom as AuthAtom } from "@yielded/auth";
import { Effect, Schema } from "effect";
import { AtomRegistry } from "effect/reactivity";
import { createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { AppClient } from "./auth-client";
import { AuthApi } from "./auth-contract";
import { MemberPanel } from "./auth-react";

const Session = AuthApi.actions.getSession.route.operation.rpc.successSchema;

// Each request and browser root gets its own registry, client Scope and seed.
const acquirePage = Effect.fn("example.acquirePage")(function* (initialSession: unknown) {
  const auth = AuthAtom.make(AppClient, { initialSession });

  const registry = yield* Effect.acquireRelease(
    Effect.sync(() => AtomRegistry.make()),
    (value) => Effect.sync(() => value.dispose()),
  );

  // Decode display data and acquire services before synchronous rendering.
  // Acquiring the runtime does not execute the session query.
  yield* AtomRegistry.mount(registry, auth.runtime);
  yield* AtomRegistry.getResult(registry, auth.runtime);

  return { auth, registry };
});

const page = ({ auth, registry }: Effect.Success<ReturnType<typeof acquirePage>>) =>
  createElement(
    RegistryContext.Provider,
    { value: registry },
    createElement(MemberPanel, { auth }),
  );

// The request handler passes its local auth.getSession() result. Serialize only
// the encoded public session with the framework, then close the request Scope.
export const renderAuthPage = Effect.fn("example.renderAuthPage")(function* (
  session: typeof Session.Type,
) {
  const initialSession = yield* Schema.encodeEffect(Session)(session);
  const bindings = yield* acquirePage(initialSession);
  const html = yield* Effect.sync(() => renderToString(page(bindings)));

  return { html, initialSession };
});

// Keep the caller's Scope open until the browser application unmounts.
export const hydrateAuthPage = Effect.fn("example.hydrateAuthPage")(function* (
  container: Element,
  initialSession: unknown,
) {
  const bindings = yield* acquirePage(initialSession);

  yield* Effect.acquireRelease(
    Effect.sync(() => hydrateRoot(container, page(bindings))),
    (root) => Effect.sync(() => root.unmount()),
  );

  // Live verification replaces the display seed. Account changes permanently drop it.
  return bindings;
});
