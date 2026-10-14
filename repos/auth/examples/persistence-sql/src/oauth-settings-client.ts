import { Atom as AuthAtom, Client, OAuth } from "@yielded/auth";
import { DateTime, Effect, Redacted, Schema } from "effect";
import { KeyValueStore } from "effect/persistence";
import { Atom } from "effect/reactivity";

import { Attempt, CallbackExpired, SettingsApi } from "./oauth-settings-contract";

const factory = Atom.context();
const runtime = factory(KeyValueStore.layerStorage(() => sessionStorage));
const SettingsClient = Client.make(SettingsApi, { baseUrl: location.origin });

export const auth = AuthAtom.make(SettingsClient, { runtime: factory });
export const notice = Atom.make<string | null>(null);
export const cursor = Atom.make<string | undefined>(undefined);

export const linkedAccounts = Atom.make((get) => {
  const page = get(cursor);

  return get(
    auth.listLinkedAccounts({ limit: 10, ...(page === undefined ? {} : { cursor: page }) }),
  );
});

const attempt = Atom.kvs({
  runtime,
  key: "oauth-settings/attempt",
  schema: Schema.NullOr(Attempt),
  defaultValue: () => null,
});

export const begin = runtime.fn<"sign-in" | "link" | "switch">()(
  Effect.fn("OAuthSettings.begin")(function* (kind, get) {
    get.set(notice, null);

    const input = {
      provider: "github",
      callbackId: kind === "sign-in" ? ("github" as const) : ("github-select" as const),
      returnTarget: "/oauth-settings",
    };

    const started =
      kind === "link"
        ? yield* get.setResult(auth.linkAccount, { ...input, flowId: crypto.randomUUID() })
        : yield* get.setResult(auth.signIn, input);

    get.set(attempt, {
      kind: kind === "link" ? "link" : "sign-in",
      callbackId: input.callbackId,
      flowId: started.flowId,
      expiresAtMillis: started.expiresAtMillis,
    });
    yield* Effect.sync(() => location.assign(Redacted.value(started.authorizationUrl)));
  }),
);

const CallbackQuery = Schema.Struct({
  state: Schema.String,
  code: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
  scope: Schema.optionalKey(Schema.String),
  iss: Schema.optionalKey(Schema.String),
});

export const complete = runtime.fn<void>()(
  Effect.fn("OAuthSettings.complete")(function* (_, get) {
    const url = new URL(location.href);

    if (url.pathname !== "/oauth-settings/callback") return;
    // Read once, then remove callback credentials from history before any request.
    const raw = Object.fromEntries(url.searchParams);

    yield* Effect.sync(() => history.replaceState(null, "", "/oauth-settings"));
    const saved = get(attempt);

    get.set(attempt, null);
    if (saved === null || saved.expiresAtMillis <= DateTime.toEpochMillis(yield* DateTime.now))
      return yield* CallbackExpired.make({});
    const query = yield* Schema.decodeUnknownEffect(CallbackQuery)(raw);

    if ((query.code === undefined) === (query.error === undefined))
      return yield* CallbackExpired.make({});

    const response = yield* Schema.decodeEffect(OAuth.OAuthCallbackResponse)(
      query.code !== undefined
        ? {
            _tag: "Code",
            state: query.state,
            code: query.code,
            ...(query.iss === undefined ? {} : { issuer: query.iss }),
            ...(query.scope === undefined ? {} : { scope: query.scope }),
          }
        : {
            _tag: "Error",
            state: query.state,
            ...(query.iss === undefined ? {} : { issuer: query.iss }),
            error: query.error === "access_denied" ? "access-denied" : "rejected",
          },
    );

    const input = {
      flowId: saved.flowId,
      provider: "github",
      callbackId: saved.callbackId,
      response: yield* Schema.encodeEffect(OAuth.OAuthCallbackResponse)(response),
    };

    if (saved.kind === "link") {
      const result = yield* get.setResult(auth.completeAccountLink, input);

      get.set(cursor, undefined);
      get.set(
        notice,
        result._tag === "Cancelled"
          ? "Link cancelled. Your sign-in methods are unchanged. Choose Link another account to try again."
          : result.changed
            ? "Account linked. You can now sign in with either identity."
            : "This identity is already linked to your account.",
      );
    } else {
      const result = yield* get.setResult(auth.completeSignIn, input);

      get.set(
        notice,
        "_tag" in result && result._tag === "Cancelled"
          ? "Sign-in cancelled. Start again with a linked GitHub account."
          : "Signed in. Account changes are available for five minutes.",
      );
    }
  }),
);

export const unlink = runtime.fn<string>()(
  Effect.fn("OAuthSettings.unlink")(function* (credentialId, get) {
    get.set(notice, null);
    yield* get.setResult(auth.unlinkAccount, { credentialId, commandId: crypto.randomUUID() });
    get.set(cursor, undefined);
    get.set(
      notice,
      "Sign-in method removed. Sessions have been invalidated. Sign in with a remaining identity.",
    );
  }),
);

export const signOut = runtime.fn<void>()(
  Effect.fn("OAuthSettings.signOut")(function* (_, get) {
    yield* get.setResult(auth.signOut, undefined);
    get.set(attempt, null);
    get.set(cursor, undefined);
    get.set(notice, "Signed out.");
  }),
);
