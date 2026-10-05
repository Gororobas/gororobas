import { RegistryProvider, useAtom, useAtomValue } from "@effect/atom-react";
import { Effect, Layer, Schema } from "effect";
import { AsyncResult, Atom, Reactivity } from "effect/reactivity";
import { createRoot } from "react-dom/client";

import { type Action, DesktopError, Reply } from "./public";

import "./style.css";

const runtime = Atom.runtime(Layer.empty);
const keys = ["desktop-session"];

const request = Effect.fnUntraced(function* (action: Action) {
  const reply = yield* Effect.tryPromise({
    try: () => window.auth[action](),
    catch: () => DesktopError.make({ reason: "unavailable" }),
  }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Reply)));

  if (reply._tag === "Failure") return yield* reply.error;

  return reply.value;
});

const state = runtime.atom(request("session")).pipe(runtime.factory.withReactivity(keys));

const mutate = runtime.fn(
  (action: Exclude<Action, "session">) =>
    request(action).pipe(
      // Refresh even if sign-out succeeded but the subsequent browser launch failed.
      Effect.tapCause(() => Reactivity.invalidate(keys)),
    ),
  { reactivityKeys: keys },
);

const cancel = runtime.fn(() => request("cancel"), { reactivityKeys: keys });

function App() {
  const current = useAtomValue(state);
  const [mutation, dispatch] = useAtom(mutate);
  const [cancellation, stop] = useAtom(cancel);
  const busy = mutation.waiting || cancellation.waiting;
  const value = AsyncResult.isSuccess(current) && !current.waiting ? current.value : undefined;

  const failed =
    AsyncResult.isFailure(mutation) ||
    AsyncResult.isFailure(cancellation) ||
    AsyncResult.isFailure(current);

  return (
    <main>
      <p className="eyebrow">YIELDED AUTH · ELECTRON</p>
      <h1>Your account, in the browser.</h1>
      <p>
        Sign in, register, verify your email, or recover your account in the hosted account app.
        Then confirm the account to use here.
      </p>
      <section aria-live="polite">
        <h2>
          {busy
            ? "Waiting for your browser"
            : value?.session
              ? value.session.claims.displayName
              : "Signed out"}
        </h2>
        {!busy && value?.session && (
          <p>
            {value.session.claims.email} ·{" "}
            {value.session.claims.emailVerified ? "Email verified" : "Email not verified"}
          </p>
        )}
        {value?.attempt === "waiting" && (
          <p>A browser login is pending. Resume it or cancel before starting again.</p>
        )}
        {value?.attempt === "indeterminate" && (
          <p>
            The previous exchange has an uncertain outcome. Recover a saved session first. If it
            cannot be verified, ask the backend operator to revoke the possible session before
            retiring this attempt; see the README.
          </p>
        )}
        {failed && (
          <p role="alert">
            The action could not complete. Check the backend, protocol registration, and secure
            storage. Resume a pending attempt instead of starting another.
          </p>
        )}
        <div className="actions">
          <button
            disabled={busy || value === undefined || value.attempt !== "none"}
            onClick={() => dispatch("signIn")}
          >
            {value?.session ? "Use another account" : "Sign in with browser"}
          </button>
          <button
            disabled={busy || value?.attempt !== "waiting"}
            onClick={() => dispatch("resume")}
          >
            Resume login
          </button>
          <button
            disabled={cancellation.waiting || (!busy && value?.attempt !== "waiting")}
            onClick={() => stop()}
          >
            Cancel login
          </button>
          <button disabled={busy || !value?.session} onClick={() => dispatch("signOut")}>
            Sign out here
          </button>
          <button
            disabled={busy || value?.attempt !== "indeterminate"}
            onClick={() => dispatch("reconcile")}
          >
            Recover saved session
          </button>
        </div>
      </section>
      <p className="note">
        Using another account first signs out this app. In your browser, choose “Continue to app” or
        sign out to switch. Browser and desktop sessions are separate.
      </p>
    </main>
  );
}

const root = document.getElementById("root");

if (root !== null)
  createRoot(root).render(
    <RegistryProvider>
      <App />
    </RegistryProvider>,
  );
