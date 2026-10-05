import { Context, Effect, Layer, Redacted, type Schema, Scope } from "effect";

import type { HookDenied } from "../hooks/models";
import { guest } from "../operations/context";
import {
  AuthCredentialCommandCollector,
  AuthRevealCommandCollectorService,
} from "../operations/credentials";
import { AuthenticationRequired, type OperationBoundaryError } from "../operations/errors";
import {
  SessionInvalid,
  type SessionError,
  type SessionSignOutUnavailable,
} from "../sessions/errors";
import type { SessionSignOut } from "../sessions/models";
import type { makeSessionModule } from "../sessions/module";
import { AuthRequest } from "./AuthRequest";

export type SessionApiError = SessionError | HookDenied | OperationBoundaryError;

/** Session actions share implementations across HTTP, native and local callers. */
export interface SessionApi<Session, R = never> {
  /** Explicit credential verification; does not read a request or renew credentials. */
  readonly verifySession: (
    credential: Redacted.Redacted<string>,
  ) => Effect.Effect<Session, SessionApiError>;
  /** Missing or invalid credentials are anonymous; availability failures remain failures. */
  readonly getSession: () => Effect.Effect<Session | null, SessionApiError, AuthRequest | R>;
  readonly requireSession: () => Effect.Effect<Session, SessionApiError, AuthRequest | R>;
  /** Does not preverify. Local clearing and server invalidation have distinct outcomes. */
  readonly signOut: () => Effect.Effect<
    SessionSignOut | SessionSignOutUnavailable,
    SessionApiError,
    AuthRequest | R
  >;
  /** Explicit renewal; ordinary session reads never rotate credentials. */
  readonly renewSession: () => Effect.Effect<Session, SessionApiError, AuthRequest | R>;
}

export const makeSessionApi = <
  const Id extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  sessions: ReturnType<typeof makeSessionModule<Id, Claims>>,
) =>
  Effect.gen(function* () {
    const strategy = yield* sessions.SessionStrategy;

    // Handler installation captures its input context. Supply only its shared
    // dependency, so constructing auth inside a request cannot retain that request.
    const handlers = yield* Layer.buildWithScope(
      sessions.sessionHandlersLayer,
      yield* Effect.scope,
    ).pipe(
      Effect.updateContext((_: Context.Context<never>) =>
        Context.make(sessions.SessionStrategy, strategy),
      ),
    );

    // Keep application codec dependencies, but never capture a request or its collectors.
    const services = (yield* Effect.context<
      Claims["DecodingServices"] | Claims["EncodingServices"]
    >()).pipe(
      Context.merge(handlers),
      Context.omit(
        AuthRequest,
        Scope.Scope,
        AuthCredentialCommandCollector,
        AuthRevealCommandCollectorService,
      ),
    );

    const verifySession = Effect.fn("Auth.verifySession")(function* (
      credential: Redacted.Redacted<string>,
    ) {
      return yield* sessions.operations.Verify.invoke(guest, {
        credential: Redacted.value(credential),
      }).pipe(
        Effect.provide(services),
        Effect.catchTag("InvalidOperationInput", () => SessionInvalid.make({})),
      );
    });

    const getSession = Effect.fn("Auth.getSession")(function* () {
      const request = yield* AuthRequest;
      const credential = request.credentials.session;

      if (credential === undefined) return null;

      return yield* verifySession(credential).pipe(
        Effect.catchTag("SessionInvalid", () => Effect.succeed(null)),
      );
    });

    const requireSession = Effect.fn("Auth.requireSession")(function* () {
      const session = yield* getSession();

      if (session === null) return yield* AuthenticationRequired.make({});

      return session;
    });

    const signOut = Effect.fn("Auth.signOut")(function* () {
      const request = yield* AuthRequest;

      if (request.beforeMutation !== undefined) yield* request.beforeMutation;
      const credential = request.credentials.session;

      if (credential === undefined || Redacted.value(credential) === "") {
        yield* request.credentialCommandSink([{ _tag: "Clear", slot: "session" }]);

        return { clearCredential: true as const, invalidation: "already-invalid" as const };
      }

      return yield* sessions.operations.SignOut.invoke(guest, {
        credential: Redacted.value(credential),
      }).pipe(
        Effect.provide(services),
        Effect.provideService(AuthCredentialCommandCollector, request.credentialCommandSink),
      );
    });

    const renewSession = Effect.fn("Auth.renewSession")(function* () {
      const request = yield* AuthRequest;

      if (request.beforeMutation !== undefined) yield* request.beforeMutation;
      const credential = request.credentials.session;

      if (credential === undefined) return yield* AuthenticationRequired.make({});

      return yield* sessions.operations.Renew.invoke(guest, {
        credential: Redacted.value(credential),
      }).pipe(
        Effect.provide(services),
        Effect.provideService(AuthCredentialCommandCollector, request.credentialCommandSink),
      );
    });

    return {
      verifySession,
      getSession,
      requireSession,
      signOut,
      renewSession,
    } satisfies SessionApi<typeof sessions.Session.Type>;
  });
