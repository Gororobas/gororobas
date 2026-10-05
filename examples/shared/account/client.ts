import { type Atom as AuthAtom, Passkey, Proofs, Schema as AuthSchema } from "@yielded/auth";
import {
  PasskeyBrowser,
  layer as layerSimpleWebAuthnPasskeyBrowser,
} from "@yielded/auth-simplewebauthn/Browser";
import { DateTime, Effect, Layer, Redacted, Schema } from "effect";
import type { KeyValueStore } from "effect/persistence";
import { Atom, type AsyncResult } from "effect/reactivity";

import type { AuthApi, emailProofPolicy } from "./contract";

// Public flow metadata only. Codes, passwords, and HttpOnly credentials stay out of storage.
const Challenge = Schema.Struct({
  ...Proofs.ProofRequestReceipt.fields,
  email: AuthSchema.Email,
  flowId: Schema.NonEmptyString,
  commandId: Schema.NonEmptyString,
  expiresAtMillis: Schema.Int,
  resendAtMillis: Schema.Int,
  continuation: Schema.optionalKey(Proofs.ProofContinuation),
});

export class FlowExpired extends Schema.TaggedError<FlowExpired>()("FlowExpired", {}) {}

type EmailAuth = AuthAtom.AuthAtoms<typeof AuthApi.namespace, typeof AuthApi.actions>;
type Session = NonNullable<Atom.Success<EmailAuth["session"]>> & {
  readonly claims: { readonly username?: string };
};

type AccountAuth = Omit<
  EmailAuth,
  "client" | "runtime" | "register" | "passwordSignIn" | "session"
> & {
  readonly session: Atom.Atom<
    AsyncResult.AsyncResult<Session | null, Atom.Failure<EmailAuth["session"]>>
  >;
};

interface RegistrationInput {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly username?: string;
}

interface SignInInput {
  readonly login: string;
  readonly password: string;
}

interface AccountActions {
  readonly register: (
    input: RegistrationInput & { readonly requestId: string },
    get: Atom.FnContext,
  ) => Effect.Effect<Atom.Success<EmailAuth["register"]>, Atom.Failure<EmailAuth["register"]>>;
  readonly signIn: (
    input: SignInInput,
    get: Atom.FnContext,
  ) => Effect.Effect<
    Atom.Success<EmailAuth["passwordSignIn"]>,
    Atom.Failure<EmailAuth["passwordSignIn"]>
  >;
}

// Each app binds its typed auth atoms to the two account form payloads.
// Workflows retain one host runtime so they can finish across sign-in/out.
export const makeAccountClient = <Auth extends AccountAuth>(
  bind: (runtime: Atom.RegistryRuntimeFactory) => AccountActions & { readonly auth: Auth },
  policy: typeof emailProofPolicy,
  storage: Layer.Layer<KeyValueStore.KeyValueStore>,
  browser: Layer.Layer<PasskeyBrowser> = layerSimpleWebAuthnPasskeyBrowser,
) => {
  const factory = Atom.context();
  const runtime = factory(Layer.merge(storage, browser));
  const { auth, register, signIn: passwordSignIn } = bind(factory);

  const page = Atom.kvs({
    runtime,
    key: "customers/page",
    schema: Schema.Literals(["register", "sign-in", "reset"]),
    defaultValue: () => "register" as const,
  });

  const notice = Atom.make<string | null>(null);

  const verification = Atom.kvs({
    runtime,
    key: "customers/verification",
    schema: Schema.NullOr(Challenge),
    defaultValue: () => null,
    mode: "async",
  });

  const recovery = Atom.kvs({
    runtime,
    key: "customers/recovery",
    schema: Schema.NullOr(Challenge),
    defaultValue: () => null,
    mode: "async",
  });

  const id = Effect.sync(() => crypto.randomUUID());
  const nowMillis = DateTime.now.pipe(Effect.map(DateTime.toEpochMillis));
  const clock = runtime.atom(nowMillis).pipe(Atom.withRefresh("1 second"));

  const windowFor = (atom: typeof verification) =>
    Atom.make((get) => {
      const saved = get(atom);
      const time = get(clock);
      const now = time._tag === "Success" ? time.value : 0;
      const challenge = saved._tag === "Success" ? saved.value : null;

      return {
        loading: saved._tag !== "Success" || time._tag !== "Success",
        expired:
          challenge !== null &&
          Math.min(
            challenge.expiresAtMillis,
            challenge.continuation?.expiresAtMillis ?? challenge.expiresAtMillis,
          ) <= now,
        resendInSeconds:
          challenge === null ? 0 : Math.max(0, Math.ceil((challenge.resendAtMillis - now) / 1000)),
      };
    });

  const verificationWindow = windowFor(verification);
  const recoveryWindow = windowFor(recovery);

  const sendVerification = runtime.fn<string>()(
    Effect.fn("Customers.sendVerification")(function* (input: string, get: Atom.FnContext) {
      const email = yield* Schema.decodeEffect(AuthSchema.Email)(input);

      get.set(notice, null);
      const current = yield* get.result(verification);
      const now = yield* nowMillis;

      // A receipt is deliberately uniform even when the server throttles a request.
      // Keep the current reference and binding during the cooldown.
      if (current !== null && current.email === email && now < current.resendAtMillis) return;

      if (current !== null && current.email === email && now < current.expiresAtMillis) {
        const next = yield* get.setResult(auth.resendEmailVerification, {
          email,
          flowId: current.flowId,
          commandId: current.commandId,
          requestId: yield* id,
          locale: "en",
          supersedes: current.reference.proofId,
        });

        get.set(verification, {
          ...next,
          email,
          flowId: current.flowId,
          commandId: current.commandId,
          expiresAtMillis: current.expiresAtMillis,
          resendAtMillis: (yield* nowMillis) + policy.abuse.resendCooldownMillis,
        });

        return;
      }
      const flow = yield* get.setResult(auth.beginEmailAddress, { flowId: yield* id });
      const commandId = yield* id;

      const challenge = yield* get.setResult(auth.requestEmailVerification, {
        email,
        flowId: flow.flowId,
        commandId,
        requestId: yield* id,
        locale: "en",
      });

      get.set(verification, {
        ...challenge,
        email,
        flowId: flow.flowId,
        commandId,
        expiresAtMillis: flow.expiresAtMillis,
        resendAtMillis: (yield* nowMillis) + policy.abuse.resendCooldownMillis,
      });
    }),
  );

  const createAccount = runtime.fn<RegistrationInput>()(
    Effect.fn("Customers.createAccount")(function* (input, get) {
      get.set(notice, null);
      get.set(verification, null);
      get.set(recovery, null);

      const result = yield* register({ ...input, requestId: yield* id }, get);

      if (result._tag === "ProvisioningPending") {
        get.set(notice, "Your registration is being processed. Please try signing in shortly.");

        return;
      }

      // Registration alone grants no session; verify the supplied password normally.
      const signedIn = yield* passwordSignIn({ login: input.email, password: input.password }, get);

      if (signedIn._tag === "Authenticated" && !signedIn.session.claims.emailVerified)
        // Delivery has its own pending/error state; it cannot undo authentication.
        yield* get.setResult(sendVerification, signedIn.session.claims.email).pipe(Effect.result);

      return signedIn;
    }),
  );

  const signIn = runtime.fn<SignInInput>()(
    Effect.fn("Customers.signIn")(function* (input, get) {
      get.set(notice, null);
      get.set(verification, null);
      get.set(recovery, null);

      return yield* passwordSignIn(input, get);
    }),
  );

  const signInWithPasskey = runtime.fn<void>()(
    Effect.fn("Customers.signInWithPasskey")(function* (_, get) {
      get.set(notice, null);
      const browser = yield* PasskeyBrowser;

      const started = yield* get.setResult(auth.passkeySignIn, {
        flowId: yield* id,
        commandId: yield* id,
        profileId: "default",
      });

      const response = yield* browser.authenticate({ started, mediation: "required" });

      const result = yield* get.setResult(auth.completePasskeySignIn, {
        flowId: response.flowId,
        response: Redacted.value(response.response),
      });

      get.set(verification, null);
      get.set(recovery, null);

      return result;
    }),
  );

  const passkeys = auth.listPasskeys({ limit: 5 });

  const addPasskey = runtime.fn<{ readonly name: string }>()(
    Effect.fn("Customers.addPasskey")(function* (input, get) {
      get.set(notice, null);
      const current = yield* get.result(auth.session);

      if (current === null) return yield* Passkey.PasskeyActionRequired.make({});
      const browser = yield* PasskeyBrowser;

      const started = yield* get.setResult(auth.enrollPasskey, {
        flowId: yield* id,
        commandId: yield* id,
        profileId: "default",
        name:
          current.claims.email.length <= 128 ? current.claims.email : current.claims.displayName,
      });

      const response = yield* browser.register(started);

      const added = yield* get.setResult(auth.completePasskeyEnrollment, {
        flowId: response.flowId,
        response: Redacted.value(response.response),
      });

      const named = yield* get
        .setResult(auth.renamePasskey, {
          commandId: yield* id,
          credentialId: added.credential.credentialId,
          name: input.name.trim() || "My passkey",
        })
        .pipe(Effect.result);

      get.set(
        notice,
        named._tag === "Success"
          ? "Passkey added. You can use it next time you sign in."
          : "Passkey added. Its name could not be saved.",
      );
    }),
  );

  const verifyEmail = runtime.fn<string>()(
    Effect.fn("Customers.verifyEmail")(function* (code: string, get: Atom.FnContext) {
      const current = yield* get.result(verification);

      if (current === null || current.expiresAtMillis <= (yield* nowMillis))
        return yield* FlowExpired.make({});
      const base = { email: current.email, flowId: current.flowId, commandId: current.commandId };

      if (
        current.continuation !== undefined &&
        current.continuation.expiresAtMillis <= (yield* nowMillis)
      )
        return yield* FlowExpired.make({});

      const continuation =
        current.continuation ??
        (yield* get.setResult(auth.verifyEmailAddress, {
          ...base,
          reference: current.reference,
          secret: code,
        })).continuation;

      get.set(verification, { ...current, continuation });
      yield* get.setResult(auth.completeEmailVerification, {
        ...base,
        continuationId: continuation.continuationId,
      });
      get.set(verification, null);
      get.set(notice, "Email verified.");
    }),
  );

  const requestReset = runtime.fn<string>()(
    Effect.fn("Customers.requestReset")(function* (input, get) {
      const email = yield* Schema.decodeEffect(AuthSchema.Email)(input);

      get.set(notice, null);
      const current = yield* get.result(recovery);
      const now = yield* nowMillis;

      if (current !== null && current.email === email && now < current.resendAtMillis) return;

      const flowId =
        current !== null && current.email === email && now < current.expiresAtMillis
          ? current.flowId
          : yield* id;

      const challenge = yield* get.setResult(auth.requestReset, {
        email,
        flowId,
        requestId: yield* id,
        locale: "en",
      });

      get.set(recovery, {
        ...challenge,
        email,
        flowId,
        commandId: yield* id,
        expiresAtMillis: now + policy.lifetimeMillis,
        resendAtMillis: (yield* nowMillis) + policy.abuse.resendCooldownMillis,
      });
    }),
  );

  const resetPassword = runtime.fn<{
    readonly code: string;
    readonly password: string;
  }>()(
    Effect.fn("Customers.resetPassword")(function* ({ code, password }, get) {
      const current = yield* get.result(recovery);

      if (current === null || current.expiresAtMillis <= (yield* nowMillis))
        return yield* FlowExpired.make({});
      const base = { email: current.email, flowId: current.flowId };
      const now = DateTime.toEpochMillis(yield* DateTime.now);
      const saved = current.continuation;

      if (saved !== undefined && saved.expiresAtMillis <= now) {
        get.set(recovery, null);

        return yield* FlowExpired.make({});
      }

      const continuation =
        saved ??
        (yield* get.setResult(auth.verifyReset, {
          ...base,
          reference: current.reference,
          secret: code,
        })).continuation;

      get.set(recovery, { ...current, continuation });
      yield* get.setResult(auth.completeReset, {
        ...base,
        commandId: current.commandId,
        continuationId: continuation.continuationId,
        newPassword: password,
      });
      get.set(recovery, null);
      get.set(page, "sign-in");
      get.set(notice, "Password updated. Sign in with your new password.");
    }),
  );

  const signOut = runtime.fn<void>()(
    Effect.fn("Customers.signOut")(function* (_, get) {
      yield* get.setResult(auth.signOut, undefined);
      get.set(verification, null);
      get.set(recovery, null);
      get.set(page, "sign-in");
      get.set(notice, "You have signed out.");
    }),
  );

  return {
    runtime,
    auth,
    page,
    notice,
    verification,
    verificationWindow,
    recovery,
    recoveryWindow,
    createAccount,
    signIn,
    signInWithPasskey,
    passkeys,
    addPasskey,
    signOut,
    sendVerification,
    verifyEmail,
    requestReset,
    resetPassword,
  };
};

export type AccountClient = ReturnType<typeof makeAccountClient>;
