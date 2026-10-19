import { beforeEach, describe, expect, it, vi } from "@effect/vitest"
import { AuthenticationSession } from "@gororobas/domain/authentication/auth-contract"
import { Sessions } from "@yielded/auth"
import { Deferred, Effect, Fiber, Schema } from "effect"

import { makeSessionAccess, sessionStorageKey, type SessionState } from "./session-access"

const session = Schema.decodeSync(AuthenticationSession)({
  sessionId: "session-1",
  subjectId: "person-1",
  securityRevision: "revision-1",
  assurance: {
    method: "email",
    authenticatedAt: 1_000,
    factors: ["possession"],
  },
  issuedAt: 1_000,
  expiresAt: 1_000_000,
  absoluteExpiresAt: 2_000_000,
  claims: {},
})

const fixture = async (remember = true) => {
  let online = true
  const states: SessionState[] = []

  const auth = {
    getSession: vi.fn<() => Effect.Effect<typeof session | null, unknown>>(() =>
      Effect.succeed(session),
    ),
    renewSession: vi.fn<() => Effect.Effect<typeof session, unknown>>(() =>
      Effect.succeed(session),
    ),
    signOut: vi.fn<() => Effect.Effect<unknown, unknown>>(() => Effect.void),
  }

  const create = () =>
    Effect.runPromise(
      makeSessionAccess({
        auth,
        storage: localStorage,
        online: () => online,
        changed: (state) => states.push(state),
      }),
    )

  const access = await create()
  if (remember) {
    await Effect.runPromise(access.remember({ subjectId: session.subjectId, name: "Ana" }))
  }

  return {
    access,
    auth,
    states,
    create,
    setOnline: (value: boolean) => {
      online = value
    },
  }
}

beforeEach(() => localStorage.clear())

describe("local session access", () => {
  it("restores identity offline after reopening, even with an old credential", async () => {
    const fixtureValue = await fixture()
    fixtureValue.setOnline(false)
    const reopened = await fixtureValue.create()
    await Effect.runPromise(reopened.ensureReady().pipe(Effect.ignore))
    expect(reopened.read()).toEqual({
      identity: { subjectId: "person-1", name: "Ana" },
      status: "Offline",
    })
    expect(fixtureValue.auth.getSession).not.toHaveBeenCalled()
  })

  it("shares validation and rotation before concurrent work can continue", async () => {
    const { access, auth } = await fixture()

    await Effect.runPromise(
      Effect.all([access.ensureReady("person-1"), access.ensureReady("person-1")], {
        concurrency: "unbounded",
      }),
    )

    expect(auth.getSession).toHaveBeenCalledTimes(1)
    expect(auth.getSession).toHaveBeenCalledWith({ fresh: true })
    expect(auth.renewSession).toHaveBeenCalledTimes(1)
    expect(access.read().status).toBe("Ready")
  })

  it("accepts a valid session when renewal is not due", async () => {
    const { access, auth } = await fixture()
    auth.renewSession.mockImplementation(() =>
      Effect.fail(Sessions.SessionRenewalTooEarly.make({ retryAt: session.expiresAt })),
    )
    await Effect.runPromise(access.ensureReady("person-1"))
    expect(access.read().status).toBe("Ready")
  })

  it("keeps identity through transport errors and failed renewals, then retries", async () => {
    const { access, auth } = await fixture()
    auth.renewSession.mockImplementationOnce(() => Effect.fail({ _tag: "SessionUnavailable" }))
    await Effect.runPromise(access.ensureReady().pipe(Effect.ignore))
    expect(access.read().status).toBe("Offline")
    expect(access.read().identity?.name).toBe("Ana")
    await Effect.runPromise(access.ensureReady())
    expect(access.read().status).toBe("Ready")
  })

  it.each(["SessionInvalid", "AuthenticationRequired", "StaleAuthentication"])(
    "logs out on %s and leaves account outboxes untouched",
    async (_tag) => {
      const { access, auth, create } = await fixture()
      localStorage.setItem("gororobas.outbox.person-1", '[{"edit":"kept"}]')
      auth.renewSession.mockImplementation(() => Effect.fail({ _tag }))
      await Effect.runPromise(access.ensureReady().pipe(Effect.ignore))
      expect(access.read()).toEqual({ identity: null, status: "SignedOut" })
      expect((await create()).read().identity).toBeNull()
      expect(localStorage.getItem("gororobas.outbox.person-1")).toBe('[{"edit":"kept"}]')
    },
  )

  it("rejects a server-cleared session", async () => {
    const { access, auth } = await fixture()
    auth.getSession.mockImplementation(() => Effect.succeed(null))
    await Effect.runPromise(access.ensureReady().pipe(Effect.ignore))
    expect(access.read().status).toBe("SignedOut")
    expect(auth.renewSession).not.toHaveBeenCalled()
  })

  it("never releases one account's outbox under another account", async () => {
    const { access, auth } = await fixture()
    await expect(Effect.runPromise(access.ensureReady("person-2"))).rejects.toMatchObject({
      _tag: "SessionNotReady",
    })
    expect(auth.getSession).not.toHaveBeenCalled()

    auth.getSession.mockImplementation(() =>
      Effect.succeed({
        ...session,
        subjectId: AuthenticationSession.fields.subjectId.make("person-2"),
      }),
    )

    await expect(Effect.runPromise(access.ensureReady("person-1"))).rejects.toMatchObject({
      _tag: "SessionNotReady",
    })
    expect(access.read().identity).toBeNull()
  })

  it("persists offline sign-out and revokes the cookie before a later sign-in", async () => {
    const { access, auth, create, setOnline } = await fixture()
    setOnline(false)
    await Effect.runPromise(access.signOut)
    expect(auth.signOut).not.toHaveBeenCalled()
    const reopened = await create()
    expect(reopened.read().identity).toBeNull()
    setOnline(true)
    await Effect.runPromise(reopened.flushSignOut)
    expect(auth.signOut).toHaveBeenCalledOnce()
    expect(JSON.parse(localStorage.getItem(sessionStorageKey) ?? "{}").hasPendingSignOut).toBe(
      false,
    )
  })

  it.live("does not undo another tab's sign-out when validation finishes late", () =>
    Effect.gen(function* () {
      const { access, auth } = yield* Effect.tryPromise(() => fixture())
      const started = yield* Deferred.make<void>()
      const finished = yield* Deferred.make<void>()

      auth.renewSession.mockImplementation(() =>
        Effect.gen(function* () {
          yield* Deferred.succeed(started, undefined)
          yield* Deferred.await(finished)
          return session
        }),
      )

      const validation = yield* access.ensureReady().pipe(Effect.ignore, Effect.forkChild)
      yield* Deferred.await(started)
      localStorage.setItem(sessionStorageKey, '{"identity":null,"hasPendingSignOut":true}')
      yield* Deferred.succeed(finished, undefined)
      yield* Fiber.join(validation)
      expect(access.read().identity).toBeNull()
      expect(JSON.parse(localStorage.getItem(sessionStorageKey) ?? "{}").hasPendingSignOut).toBe(
        true,
      )
    }),
  )

  it("treats malformed local data as signed out", async () => {
    localStorage.setItem(sessionStorageKey, '{"identity":{"subjectId":23}}')
    const { access } = await fixture(false)
    expect(access.read().identity).toBeNull()
  })
})
