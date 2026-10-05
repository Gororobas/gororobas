import { Atom as AuthAtom, Client, type Proofs } from "@yielded/auth";
import { Effect, Redacted, Schema } from "effect";

import { LoginApi } from "./login-contract";

export const AppClient = Client.make(LoginApi, { baseUrl: "https://app.example.com" });
export const auth = AuthAtom.make(AppClient);
const Provider = Schema.Literals(["github", "google"]);

export class BrowserFlowUnavailable extends Schema.TaggedError<BrowserFlowUnavailable>()(
  "BrowserFlowUnavailable",
  {},
) {}

// The generated authorization URL has already crossed the HTTP schema boundary.
// The HTTP callback recovers the flow from its verified HttpOnly binding cookie.
export const login = auth.runtime.fn<typeof Provider.Type>()(
  Effect.fn("example.oauthLogin")(function* (provider) {
    const client = yield* AppClient;

    const started = yield* client.auth.signIn({
      provider,
      returnTarget: "/account",
    });

    yield* Effect.try({
      try: () => location.assign(Redacted.value(started.authorizationUrl)),
      catch: () => BrowserFlowUnavailable.make({}),
    });
  }),
);

// Direct Effect-first calls are also available. auth.session and auth.signOut
// expose the same methods through the application's ordinary Atom registry.
export const currentSession = Effect.gen(function* () {
  const client = yield* AppClient;

  return yield* client.auth.getSession();
});

export const logout = Effect.gen(function* () {
  const client = yield* AppClient;

  yield* client.auth.signOut();
});

// OAuth callbacks are served by Http. The app's /register page dispatches
// auth.register with the public flowId/reference supplied by the server redirect.
// Start a fresh login after RegistrationAccepted.

export const sendEmailCode = auth.runtime.fn<string>()(
  Effect.fn("example.sendEmailCode")(function* (email) {
    const client = yield* AppClient;

    const ids = yield* Effect.try({
      try: () => ({ flowId: crypto.randomUUID(), requestId: crypto.randomUUID() }),
      catch: () => BrowserFlowUnavailable.make({}),
    });

    yield* client.auth.beginEmailSignIn({ flowId: ids.flowId });

    const result = yield* client.auth.requestEmailCode({
      ...ids,
      email,
      returnTarget: "/account",
      locale: "en",
    });

    return { flowId: ids.flowId, email, reference: result.reference };
  }),
);

export const confirmEmailCode = auth.runtime.fn<{
  readonly flowId: string;
  readonly email: string;
  readonly reference: typeof Proofs.ProofReference.Encoded;
  readonly code: string;
}>()(
  Effect.fn("example.confirmEmailCode")(function* (input) {
    const client = yield* AppClient;
    const base = { flowId: input.flowId, email: input.email, returnTarget: "/account" };

    const verified = yield* client.auth.verifyEmailCode({
      ...base,
      reference: input.reference,
      secret: input.code,
    });

    return yield* client.auth.completeEmailSignIn({
      ...base,
      continuationId: verified.continuation.continuationId,
    });
  }),
);
