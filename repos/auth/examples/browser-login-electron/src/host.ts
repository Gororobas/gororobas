import type { Operations } from "@yielded/auth";
import { BrowserLogin, OperationHttpClient } from "@yielded/auth";
import { Effect, Fiber, Schema, Semaphore } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import { handoff, nativeSession } from "../../shared/account/browser-login-contract";
import type { State } from "./public";
import { Action, DesktopError, Reply } from "./public";

const headers = (prefix: string): Readonly<Record<Operations.CredentialSlot, string>> => ({
  session: `${prefix}session`,
  "pending-proof": `${prefix}pending-proof`,
  "proof-continuation": `${prefix}proof-continuation`,
  registration: `${prefix}registration`,
  "request-binding": `${prefix}request-binding`,
  "session-step-up": `${prefix}session-step-up`,
  "password-intent": `${prefix}password-intent`,
  "connected-intent": `${prefix}connected-intent`,
});

export const makeHost = Effect.fnUntraced(function* (hostedUrl: string) {
  const vault = yield* BrowserLogin.Vault;

  const http = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.setHeader("x-auth-client", "yielded-native")),
  );

  const transport = yield* OperationHttpClient.make({
    baseUrl: new URL(hostedUrl).origin,
    csrfHeader: "x-auth-csrf",
    csrfValue: "operation",
    native: {
      modeHeader: "x-auth-mode",
      requestHeaders: headers("x-auth-request-"),
      responseHeaders: headers("x-auth-response-"),
      credentials: BrowserLogin.Vault,
    },
  }).pipe(Effect.provideService(HttpClient.HttpClient, http));

  const client = yield* BrowserLogin.makeClient(handoff, {
    clientId: "electron",
    returnUrl: "dev.yielded.auth://callback",
    hostedUrl,
  }).pipe(Effect.provideService(OperationHttpClient.Client, transport));

  const gate = yield* Semaphore.make(1);
  let interruptLogin: Effect.Effect<void> | undefined;

  const session = Effect.gen(function* () {
    if ((yield* vault.read).session === undefined) return null;

    return yield* transport
      .call(nativeSession.routes.session, {})
      .pipe(Effect.catchTag("SessionInvalid", () => Effect.succeed(null)));
  });

  const snapshot = Effect.gen(function* (): Effect.fn.Return<
    typeof State.Type,
    Effect.Error<typeof session> | BrowserLogin.PlatformError
  > {
    const attempt = yield* vault.loadAttempt;

    return {
      session: yield* session,
      attempt:
        attempt === undefined
          ? "none"
          : attempt.phase === "Exchanging"
            ? "indeterminate"
            : "waiting",
    };
  });

  const reconcile = Effect.gen(function* () {
    if ((yield* vault.loadAttempt)?.phase !== "Exchanging") return;
    const status = yield* client.status;
    const restored = yield* session;

    if (
      status?.status !== "Complete" ||
      restored === null ||
      status.sessionId !== restored.sessionId
    )
      return yield* DesktopError.make({ reason: "indeterminate" });
    yield* client.acknowledge;
  });

  const signOut = Effect.gen(function* () {
    // Preserve the credential needed to reconcile a completed but unacknowledged exchange.
    yield* reconcile;
    if ((yield* vault.read).session === undefined) return;

    const result = yield* transport.call(
      nativeSession.routes.signOut,
      {},
      { replaceSubject: true },
    );

    if ("_tag" in result) return yield* DesktopError.make({ reason: "sign-out" });
  });

  const login = (effect: Effect.Effect<unknown, Effect.Error<typeof client.signIn>>) =>
    Effect.withFiber((fiber) => {
      interruptLogin = Fiber.interrupt(fiber);

      return effect.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            interruptLogin = undefined;
          }),
        ),
      );
    });

  const dispatch = Effect.fnUntraced(function* (action: Action) {
    // React subscriptions may overlap reads. Serialize them; a busy mutation is
    // not a failed session restoration.
    if (action === "session") return yield* gate.withPermits(1)(snapshot);
    if (action === "cancel") yield* interruptLogin ?? Effect.void;
    if (!(yield* gate.takeIfAvailable(1))) return yield* DesktopError.make({ reason: "busy" });

    return yield* Effect.gen(function* () {
      switch (action) {
        case "signIn":
          if ((yield* vault.loadAttempt) !== undefined)
            return yield* DesktopError.make({ reason: "busy" });
          // Revocation must settle before any new browser attempt is initiated.
          yield* signOut;
          yield* login(client.signIn);
          break;
        case "resume":
          yield* login(client.resume);
          break;
        case "cancel":
          yield* client.cancel;
          break;
        case "reconcile":
          yield* reconcile;
          break;
        case "signOut":
          yield* signOut;
          break;
      }

      return yield* snapshot;
    }).pipe(Effect.ensuring(gate.release(1)));
  });

  return Effect.fnUntraced(function* (input: unknown) {
    const result = yield* Schema.decodeUnknownEffect(Action)(input).pipe(
      Effect.mapError(() => DesktopError.make({ reason: "request" })),
      Effect.flatMap(dispatch),
      Effect.map((value) => ({ _tag: "Success" as const, value })),
      Effect.catchTag("BrowserLoginPlatformError", (error) =>
        Effect.fail(DesktopError.make({ reason: error.reason })),
      ),
      Effect.catchTag("BrowserLoginIndeterminate", () =>
        Effect.fail(DesktopError.make({ reason: "indeterminate" })),
      ),
      Effect.catchTag("DesktopError", (error) =>
        Effect.succeed({ _tag: "Failure" as const, error }),
      ),
      // No error causes, transport details, URLs or credentials cross IPC.
      Effect.catchCause(() =>
        Effect.succeed({
          _tag: "Failure" as const,
          error: DesktopError.make({ reason: "unavailable" }),
        }),
      ),
    );

    return yield* Schema.encodeEffect(Reply)(result);
  });
});
