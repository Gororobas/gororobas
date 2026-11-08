import {
  AuthenticationApi,
  AuthenticationSession,
  csrfProtection,
} from "@gororobas/domain/authentication/auth-contract"
import { Client } from "@yielded/auth"
import {
  Clock,
  Context,
  Effect,
  Layer,
  Option,
  Predicate,
  Schema,
  Semaphore,
  Stream,
  SubscriptionRef,
} from "effect"

export const AuthenticationClient = Client.make(AuthenticationApi, {
  baseUrl: window.location.origin,
  csrf: csrfProtection,
})

export const LocalIdentity = Schema.Struct({
  subjectId: AuthenticationSession.fields.subjectId,
  name: Schema.NullOr(Schema.String),
})
export type LocalIdentity = typeof LocalIdentity.Type

export const SessionState = Schema.Struct({
  identity: Schema.NullOr(LocalIdentity),
  status: Schema.Literals(["Checking", "Ready", "Offline", "SignedOut"]),
})
export type SessionState = typeof SessionState.Type

const StoredSession = Schema.Struct({
  identity: Schema.NullOr(LocalIdentity),
  hasPendingSignOut: Schema.Boolean,
})
const StoredSessionJson = Schema.fromJsonString(StoredSession)
export const sessionStorageKey = "gororobas.local-session"

export class SessionNotReadyError extends Schema.TaggedError<SessionNotReadyError>()(
  "SessionNotReadyError",
  {},
) {}

export class AuthenticationRequestError extends Schema.TaggedError<AuthenticationRequestError>()(
  "AuthenticationRequestError",
  { cause: Schema.Unknown },
) {}
export class SessionStorageError extends Schema.TaggedError<SessionStorageError>()(
  "SessionStorageError",
  { cause: Schema.Unknown },
) {}

interface AuthPort<AuthError> {
  readonly getSession: (options: {
    fresh: true
  }) => Effect.Effect<typeof AuthenticationSession.Type | null, AuthError>
  readonly renewSession: () => Effect.Effect<typeof AuthenticationSession.Type, AuthError>
  readonly signOut: () => Effect.Effect<unknown, AuthError>
}

/** The auth adapter wraps failures; the original tag decides whether the session is gone. */
const unwrapAuthFailure = <Failure>(error: Failure) =>
  Schema.is(AuthenticationRequestError)(error) ? error.cause : error

/** Local identity is advisory; only the server-held cookie authorizes network work. */
export const makeSessionAccess = Effect.fn(function* <AuthError>(options: {
  readonly auth: AuthPort<AuthError>
  readonly storage: Storage
  readonly online: () => boolean
}) {
  const gate = yield* Semaphore.make(1)
  let stored: typeof StoredSession.Type = { identity: null, hasPendingSignOut: false }

  const readStored = Effect.try({
    try: () => options.storage.getItem(sessionStorageKey),
    catch: (cause) => new SessionStorageError({ cause }),
  }).pipe(
    Effect.map((raw) =>
      raw === null ? Option.none() : Schema.decodeOption(StoredSessionJson)(raw),
    ),
    Effect.map((decoded) =>
      Option.getOrElse(decoded, () => ({ identity: null, hasPendingSignOut: false })),
    ),
    Effect.orElseSucceed(() => stored),
  )

  stored = yield* readStored
  let checkedAt = -Infinity

  const states = yield* SubscriptionRef.make<SessionState>({
    identity: stored.identity,
    status: stored.identity === null ? "SignedOut" : "Checking",
  })
  const read = () => SubscriptionRef.getUnsafe(states)
  // The account this tab signed in to, which its own sign-in flow carries on from without a reload.
  let signedInHere: string | null = null

  const publish = (status: SessionState["status"]) =>
    SubscriptionRef.set(states, { identity: stored.identity, status })

  const persist = Effect.suspend(() => Schema.encodeEffect(StoredSessionJson)(stored)).pipe(
    Effect.flatMap((encoded) =>
      Effect.try({
        try: () => options.storage.setItem(sessionStorageKey, encoded),
        catch: (cause) => new SessionStorageError({ cause }),
      }),
    ),
    Effect.ignore,
  )

  const reject = Effect.gen(function* () {
    stored = { ...stored, identity: null }
    checkedAt = -Infinity
    yield* persist
    yield* publish("SignedOut")
  })

  const settleSignOut = Effect.gen(function* () {
    if (!stored.hasPendingSignOut) return
    yield* options.auth.signOut().pipe(Effect.timeout("10 seconds"))
    stored = { identity: null, hasPendingSignOut: false }
    yield* persist
  })

  const synchronize = Effect.gen(function* () {
    const latest = yield* readStored

    if (
      latest.identity?.subjectId === stored.identity?.subjectId &&
      latest.hasPendingSignOut === stored.hasPendingSignOut
    ) {
      return false
    }

    stored = latest
    checkedAt = -Infinity
    yield* publish(stored.identity === null ? "SignedOut" : "Checking")
    return true
  })

  const ensureReady = (expectedSubjectId?: string, fresh = false) =>
    gate.withPermits(1)(
      Effect.gen(function* () {
        yield* synchronize

        if (!options.online()) {
          yield* publish(stored.identity === null ? "SignedOut" : "Offline")
          return yield* new SessionNotReadyError()
        }
        if (expectedSubjectId !== undefined && stored.identity?.subjectId !== expectedSubjectId) {
          return yield* new SessionNotReadyError()
        }
        const now = yield* Clock.currentTimeMillis

        if (
          !fresh &&
          read().status === "Ready" &&
          now - checkedAt < 30_000 &&
          stored.identity !== null
        ) {
          return stored.identity
        }

        yield* publish(stored.identity === null ? "SignedOut" : "Checking")

        const session = yield* Effect.gen(function* () {
          yield* settleSignOut
          const current = yield* options.auth.getSession({ fresh: true })
          if (current === null) return null

          // Reject account switches before rotating a credential or releasing queued work.
          if (stored.identity !== null && stored.identity.subjectId !== current.subjectId) {
            if (yield* synchronize) return yield* new SessionNotReadyError()
            yield* reject
            return yield* new SessionNotReadyError()
          }

          return yield* options.auth.renewSession().pipe(
            Effect.catchIf(
              (error) => Predicate.isTagged(unwrapAuthFailure(error), "SessionRenewalTooEarly"),
              () => Effect.succeed(current),
            ),
          )
        }).pipe(
          Effect.timeout("10 seconds"),
          Effect.catch((error) =>
            Effect.gen(function* () {
              if (yield* synchronize) return yield* new SessionNotReadyError()

              const failure = unwrapAuthFailure(error)

              if (
                Predicate.isTagged(failure, "AuthenticationRequired") ||
                Predicate.isTagged(failure, "SessionInvalid") ||
                Predicate.isTagged(failure, "StaleAuthentication")
              ) {
                yield* reject
              } else yield* publish(stored.identity === null ? "SignedOut" : "Offline")

              return yield* new SessionNotReadyError()
            }),
          ),
        )

        if (yield* synchronize) return yield* new SessionNotReadyError()

        if (
          session === null ||
          (stored.identity !== null && stored.identity.subjectId !== session.subjectId)
        ) {
          yield* reject
          return yield* new SessionNotReadyError()
        }

        stored = {
          identity: { subjectId: session.subjectId, name: stored.identity?.name ?? null },
          hasPendingSignOut: false,
        }
        checkedAt = now
        yield* persist
        yield* publish("Ready")
        if (expectedSubjectId !== undefined && session.subjectId !== expectedSubjectId) {
          return yield* new SessionNotReadyError()
        }
        return stored.identity
      }),
    )

  const changes = SubscriptionRef.changes(states)

  return {
    read,
    /** The current state, then every change: other tabs' changes arrive through `connectionChanged`. */
    changes,
    /**
     * The browser's account (`null` for visitors) each time it changes from the one this page loaded data for: it was
     * loaded with the previous account's cookie, so it may show what the new one can't see.
     * The page-load check is no switch (it confirms or corrects the account remembered from the
     * last visit), and neither is signing in from this tab, whose flow carries on without reloading.
     */
    switchedAccounts: changes.pipe(
      Stream.dropWhile(({ status }) => status === "Checking"),
      Stream.map(({ identity }) => identity?.subjectId ?? null),
      Stream.changes,
      Stream.drop(1),
      Stream.filter((subjectId) => subjectId === null || subjectId !== signedInHere),
    ),
    ensureReady,
    flushSignOut: gate.withPermits(1)(
      Effect.gen(function* () {
        const latest = yield* readStored
        if (latest.hasPendingSignOut) stored = latest
        yield* settleSignOut
      }),
    ),
    remember: (identity: LocalIdentity) =>
      gate.withPermits(1)(
        Effect.gen(function* () {
          stored = { identity, hasPendingSignOut: false }
          signedInHere = identity.subjectId
          checkedAt = -Infinity
          yield* persist
          yield* publish("Checking")
        }),
      ),
    setName: (name: string | null) =>
      gate.withPermits(1)(
        Effect.gen(function* () {
          if (stored.identity !== null) {
            stored = { ...stored, identity: { ...stored.identity, name } }
            yield* persist
            yield* publish(read().status)
          }
        }),
      ),
    connectionChanged: gate.withPermits(1)(
      Effect.gen(function* () {
        stored = yield* readStored
        checkedAt = -Infinity
        yield* publish(
          stored.identity === null ? "SignedOut" : options.online() ? "Checking" : "Offline",
        )
      }),
    ),
    signOut: gate.withPermits(1)(
      Effect.gen(function* () {
        stored = { identity: null, hasPendingSignOut: true }
        yield* reject
        if (options.online()) yield* settleSignOut.pipe(Effect.ignore)
      }),
    ),
    reject: gate.withPermits(1)(reject),
  }
})

export class SessionAccess extends Context.Service<
  SessionAccess,
  Effect.Success<ReturnType<typeof makeSessionAccess<AuthenticationRequestError>>>
>()("SessionAccess") {}

export const sessionAccessLayer = Layer.effect(
  SessionAccess,
  Effect.gen(function* () {
    const { auth } = yield* AuthenticationClient

    return yield* makeSessionAccess({
      auth: {
        getSession: (options) =>
          auth
            .getSession(options)
            .pipe(Effect.mapError((cause) => new AuthenticationRequestError({ cause }))),
        renewSession: () =>
          auth
            .renewSession()
            .pipe(Effect.mapError((cause) => new AuthenticationRequestError({ cause }))),
        signOut: () =>
          auth
            .signOut()
            .pipe(Effect.mapError((cause) => new AuthenticationRequestError({ cause }))),
      },
      storage: localStorage,
      online: () => navigator.onLine,
    })
  }),
).pipe(Layer.provide(AuthenticationClient.layerFetch.pipe(Layer.orDie)))
