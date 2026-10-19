import {
  AuthenticationApi,
  AuthenticationSession,
} from "@gororobas/domain/authentication/auth-contract"
import { Client } from "@yielded/auth"
import { Clock, Context, Effect, Layer, Option, Predicate, Schema, Semaphore } from "effect"

export const AuthenticationClient = Client.make(AuthenticationApi, {
  baseUrl: window.location.origin,
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
export const sessionChangedEvent = "gororobas-session-changed"

export class SessionNotReady extends Schema.TaggedError<SessionNotReady>()("SessionNotReady", {}) {}

interface AuthPort {
  readonly getSession: (options: {
    fresh: true
  }) => Effect.Effect<typeof AuthenticationSession.Type | null, unknown>
  readonly renewSession: () => Effect.Effect<typeof AuthenticationSession.Type, unknown>
  readonly signOut: () => Effect.Effect<unknown, unknown>
}

/** Local identity is advisory; only the server-held cookie authorizes network work. */
export const makeSessionAccess = Effect.fn(function* (options: {
  readonly auth: AuthPort
  readonly storage: Storage
  readonly online: () => boolean
  readonly changed: (state: SessionState) => void
}) {
  const gate = yield* Semaphore.make(1)
  let stored: typeof StoredSession.Type = { identity: null, hasPendingSignOut: false }

  const readStored = Effect.try(() => options.storage.getItem(sessionStorageKey)).pipe(
    Effect.map((raw) =>
      raw === null ? Option.none() : Schema.decodeOption(StoredSessionJson)(raw),
    ),
    Effect.map((decoded) =>
      Option.getOrElse(decoded, () => ({ identity: null, hasPendingSignOut: false })),
    ),
    Effect.orElseSucceed(() => stored),
  )

  stored = yield* readStored
  let state: SessionState = {
    identity: stored.identity,
    status: stored.identity === null ? "SignedOut" : "Checking",
  }
  let checkedAt = -Infinity

  const publish = (status: SessionState["status"]) => {
    state = { identity: stored.identity, status }
    options.changed(state)
  }
  const persist = Effect.try(() =>
    options.storage.setItem(sessionStorageKey, Schema.encodeSync(StoredSessionJson)(stored)),
  ).pipe(Effect.ignore)

  const reject = Effect.gen(function* () {
    stored = { ...stored, identity: null }
    checkedAt = -Infinity
    yield* persist
    publish("SignedOut")
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
    publish(stored.identity === null ? "SignedOut" : "Checking")
    return true
  })

  const ensureReady = (expectedSubjectId?: string, fresh = false) =>
    gate.withPermits(1)(
      Effect.gen(function* () {
        yield* synchronize

        if (!options.online()) {
          publish(stored.identity === null ? "SignedOut" : "Offline")
          return yield* new SessionNotReady()
        }
        if (expectedSubjectId !== undefined && stored.identity?.subjectId !== expectedSubjectId) {
          return yield* new SessionNotReady()
        }
        const now = yield* Clock.currentTimeMillis

        if (
          !fresh &&
          state.status === "Ready" &&
          now - checkedAt < 30_000 &&
          stored.identity !== null
        ) {
          return stored.identity
        }

        publish(stored.identity === null ? "SignedOut" : "Checking")

        const session = yield* Effect.gen(function* () {
          yield* settleSignOut
          const current = yield* options.auth.getSession({ fresh: true })
          if (current === null) return null

          // Reject account switches before rotating a credential or releasing queued work.
          if (stored.identity !== null && stored.identity.subjectId !== current.subjectId) {
            if (yield* synchronize) return yield* new SessionNotReady()
            yield* reject
            return yield* new SessionNotReady()
          }

          return yield* options.auth
            .renewSession()
            .pipe(
              Effect.catch((error) =>
                Predicate.isTagged(error, "SessionRenewalTooEarly")
                  ? Effect.succeed(current)
                  : Effect.fail(error),
              ),
            )
        }).pipe(
          Effect.timeout("10 seconds"),
          Effect.catch((error) =>
            Effect.gen(function* () {
              if (yield* synchronize) return yield* new SessionNotReady()

              if (
                Predicate.isTagged(error, "AuthenticationRequired") ||
                Predicate.isTagged(error, "SessionInvalid") ||
                Predicate.isTagged(error, "StaleAuthentication")
              ) {
                yield* reject
              } else publish(stored.identity === null ? "SignedOut" : "Offline")

              return yield* new SessionNotReady()
            }),
          ),
        )

        if (yield* synchronize) return yield* new SessionNotReady()

        if (
          session === null ||
          (stored.identity !== null && stored.identity.subjectId !== session.subjectId)
        ) {
          yield* reject
          return yield* new SessionNotReady()
        }

        stored = {
          identity: { subjectId: session.subjectId, name: stored.identity?.name ?? null },
          hasPendingSignOut: false,
        }
        checkedAt = now
        yield* persist
        publish("Ready")
        if (expectedSubjectId !== undefined && session.subjectId !== expectedSubjectId) {
          return yield* new SessionNotReady()
        }
        return stored.identity
      }),
    )

  return {
    read: () => state,
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
          checkedAt = -Infinity
          yield* persist
          publish("Checking")
        }),
      ),
    setName: (name: string | null) =>
      gate.withPermits(1)(
        Effect.gen(function* () {
          if (stored.identity !== null) {
            stored = { ...stored, identity: { ...stored.identity, name } }
            yield* persist
            publish(state.status)
          }
        }),
      ),
    connectionChanged: gate.withPermits(1)(
      Effect.gen(function* () {
        stored = yield* readStored
        checkedAt = -Infinity
        publish(stored.identity === null ? "SignedOut" : options.online() ? "Checking" : "Offline")
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
  Effect.Success<ReturnType<typeof makeSessionAccess>>
>()("SessionAccess") {}

export const sessionAccessLayer = Layer.effect(
  SessionAccess,
  Effect.gen(function* () {
    const { auth } = yield* AuthenticationClient

    return yield* makeSessionAccess({
      auth,
      storage: localStorage,
      online: () => navigator.onLine,
      changed: () => window.dispatchEvent(new Event(sessionChangedEvent)),
    })
  }),
).pipe(Layer.provide(AuthenticationClient.layerFetch.pipe(Layer.orDie)))
