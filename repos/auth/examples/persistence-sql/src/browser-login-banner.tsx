import { useAtom, useAtomValue } from "@effect/atom-react";
import { BrowserLogin, type OperationHttp, OperationHttpClient } from "@yielded/auth";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { Atom, type AtomRegistry } from "effect/reactivity";

import { handoff } from "../../shared/account/browser-login-contract";
import type { AccountClient } from "../../shared/account/client";

type AuthenticationAction<Action> =
  Action extends Atom.AtomResultFn<infer Input, infer Result, infer Error>
    ? (input: Input) => Effect.Effect<Result, Error>
    : never;

export class AccountAuthentication extends Context.Service<
  AccountAuthentication,
  {
    readonly [Action in "createAccount" | "signIn" | "signInWithPasskey"]: AuthenticationAction<
      AccountClient[Action]
    >;
  } & {
    readonly session: Effect.Effect<
      Atom.Success<AccountClient["auth"]["session"]>,
      Atom.Failure<AccountClient["auth"]["session"]>
    >;
  }
>()("sql-example/AccountAuthentication") {}

const requestedAttempt = new URL(window.location.href).searchParams.get("attempt");
const attemptId = Schema.is(BrowserLogin.Random)(requestedAttempt) ? requestedAttempt : null;

export const returningToApp = attemptId !== null;

const transport = OperationHttpClient.layer({
  baseUrl: window.location.origin,
  csrfHeader: "x-auth-csrf",
  csrfValue: "operation",
}).pipe(Layer.provide(FetchHttpClient.layer));

const runtime = Atom.runtime(transport);

const submitted = Atom.make(false);
const callback = Atom.make<Redacted.Redacted<string> | null>(null);

// React dispatches; the Effect owns confirmation and callback navigation.
const authorize = runtime.fn<OperationHttp.RouteInput<typeof handoff.routes.authorize>>()(
  Effect.fnUntraced(function* (input, get) {
    if (get(submitted)) return yield* BrowserLogin.Invalid.make({});
    // Authorization is single-use even if its response is lost.
    get.set(submitted, true);
    const transport = yield* OperationHttpClient.Client;

    const result = yield* transport.call(handoff.routes.authorize, input);

    get.set(callback, result.callbackUrl);
    yield* Effect.sync(() => window.location.assign(Redacted.value(result.callbackUrl)));
  }),
);

export const makeBrowserLogin = (
  authentication: Layer.Layer<AccountAuthentication, never, AtomRegistry.AtomRegistry>,
) => {
  const runtime = Atom.runtime(Layer.merge(transport, authentication));

  const initialize = runtime
    .atom((get) =>
      Effect.gen(function* () {
        if (attemptId === null) return null;

        // Capture only the initial session. Later authentication uses the explicit workflows below.
        const account = yield* AccountAuthentication;
        const initial = yield* account.session.pipe(Effect.result);

        const transport = yield* OperationHttpClient.Client;
        const description = yield* transport.call(handoff.routes.describe, { attemptId });

        if (
          description.browserSession === "automatic" &&
          initial._tag === "Success" &&
          initial.success !== null
        )
          yield* get
            .setResult(authorize, {
              attemptId,
              decision: "automatic",
              expectedSessionId: initial.success.sessionId,
            })
            .pipe(Effect.result);

        return description;
      }),
    )
    .pipe(Atom.keepAlive);

  const complete = runtime.fn<Atom.Success<AccountClient["signIn"]> | undefined>()(
    Effect.fnUntraced(function* (result, get) {
      const description = yield* get.result(initialize).pipe(Effect.result);

      if (
        result?._tag === "Authenticated" &&
        attemptId !== null &&
        description._tag === "Success" &&
        description.success !== null
      )
        // Keep return failures visible in the banner without undoing sign-in.
        yield* get
          .setResult(authorize, {
            attemptId,
            decision: "continue",
            expectedSessionId: result.session.sessionId,
          })
          .pipe(Effect.result);
    }),
  );

  const createAccount = runtime.fn<
    Parameters<AccountAuthentication["Service"]["createAccount"]>[0]
  >()(
    Effect.fnUntraced(function* (input, get) {
      yield* get.result(initialize).pipe(Effect.result);
      const account = yield* AccountAuthentication;
      const result = yield* account.createAccount(input);

      yield* get.setResult(complete, result);

      return result;
    }),
  );

  const signIn = runtime.fn<Parameters<AccountAuthentication["Service"]["signIn"]>[0]>()(
    Effect.fnUntraced(function* (input, get) {
      yield* get.result(initialize).pipe(Effect.result);
      const account = yield* AccountAuthentication;
      const result = yield* account.signIn(input);

      yield* get.setResult(complete, result);

      return result;
    }),
  );

  const signInWithPasskey = runtime.fn<void>()(
    Effect.fnUntraced(function* (_, get) {
      yield* get.result(initialize).pipe(Effect.result);
      const account = yield* AccountAuthentication;
      const result = yield* account.signInWithPasskey();

      yield* get.setResult(complete, result);

      return result;
    }),
  );

  return {
    initialize,
    createAccount,
    signIn,
    signInWithPasskey,
  };
};

export function BrowserLoginBanner({
  client,
  login,
}: {
  readonly client: AccountClient;
  readonly login: ReturnType<typeof makeBrowserLogin>;
}) {
  const initialized = useAtomValue(login.initialize);
  const session = useAtomValue(client.auth.session);
  const [result, proceed] = useAtom(authorize);
  const dispatched = useAtomValue(submitted);
  const callbackUrl = useAtomValue(callback);
  // This owner outlives the form when authentication refreshes the session query.
  const registration = useAtomValue(client.createAccount);
  const password = useAtomValue(client.signIn);
  const passkey = useAtomValue(client.signInWithPasskey);
  const signingIn = registration.waiting || password.waiting || passkey.waiting;

  if (requestedAttempt === null) return null;
  if (attemptId === null)
    return <p role="alert">Invalid sign-in attempt. Return to the app and start again.</p>;
  if (initialized._tag === "Failure")
    return (
      <p role="alert">This sign-in attempt is unavailable. Return to the app and start again.</p>
    );
  const description = initialized._tag === "Success" ? initialized.value : null;
  const account = session._tag === "Success" ? session.value : null;

  return (
    <section className="panel sign-in" aria-label="Return to app">
      <h2>
        {description === null ? "Preparing sign-in…" : `Sign in to ${description.displayName}`}
      </h2>
      <p>
        {callbackUrl !== null
          ? "You’re signed in. If the app didn’t open, use the link below."
          : signingIn || result.waiting || initialized.waiting
            ? "Signing in and returning to the app…"
            : account
              ? `Continue as ${account.claims.displayName}, or sign out below to use another account.`
              : `Sign in or create an account below to return to ${description?.displayName ?? "the app"} automatically.`}
      </p>
      {callbackUrl !== null ? (
        <a className="primary" href={Redacted.value(callbackUrl)}>
          Return to app
        </a>
      ) : account && description !== null ? (
        <button
          className="primary"
          disabled={signingIn || dispatched}
          onClick={() =>
            proceed({ attemptId, decision: "continue", expectedSessionId: account.sessionId })
          }
        >
          Continue to app
        </button>
      ) : null}
      {result._tag === "Failure" && (
        <p role="alert">
          We couldn’t return you to the app. Cancel this attempt in the app and start again. If your
          browser session is old, sign out and sign in again for fresh authentication.
        </p>
      )}
    </section>
  );
}
