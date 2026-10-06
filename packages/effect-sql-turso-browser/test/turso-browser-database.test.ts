import { afterEach, expect, it as test, vi } from "@effect/vitest"
import { Array as EffectArray, Effect, Fiber } from "effect"

const connect = async () => ({
  prepare: async (sql: string) => ({
    reader: sql.startsWith("SELECT"),
    all: async () => [
      {
        sql,
      },
    ],
    run: async () => ({
      changes: 1,
      lastInsertRowid: 1,
    }),
    raw: () => {},
    safeIntegers: () => {},
    close: () => {},
  }),
  close: async () => {},
})

const database = { connect: vi.fn<typeof connect>(connect) }

vi.doMock("@tursodatabase/database-wasm/vite", () => database)
// oxlint-disable-next-line effect/avoid-native-object-helpers -- This native BroadcastChannel fake models peer membership by object identity and delivers to peers in registration order.
const channels = new Map<string, Set<FakeChannel>>()

class FakeChannel {
  onmessage: ((event: MessageEvent) => void) | null = null
  constructor(readonly name: string) {
    // oxlint-disable-next-line effect/avoid-native-object-helpers -- This native BroadcastChannel fake models peer membership by object identity and delivers to peers in registration order.
    const peers = channels.get(name) ?? new Set<FakeChannel>()
    peers.add(this)
    channels.set(name, peers)
  }
  // oxlint-disable-next-line effect/no-unknown-parameters -- BroadcastChannel accepts arbitrary structured-clone messages; this fake delivers them unchanged to the receiver.
  postMessage(message: unknown) {
    EffectArray.forEach(channels.get(this.name) ?? [], (peer) => {
      if (peer !== this) {
        queueMicrotask(() =>
          peer.onmessage?.(
            new MessageEvent("message", {
              data: message,
            }),
          ),
        )
      }
    })
  }
  close() {
    channels.get(this.name)?.delete(this)
  }
}

const lockWaiters: Array<() => void> = []
const lockState = {
  locked: false,
}

const locks = {
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- The Web Locks API requires this positional signature.
  request: (
    _name: string,
    options: {
      signal: AbortSignal
    },
    callback: () => Promise<void>,
  ) =>
    new Promise<void>((resolve, reject) => {
      const start = () => {
        if (options.signal.aborted) {
          reject(new Error("aborted"))
          return
        }
        lockState.locked = true

        void callback()
          .then(resolve, reject)
          .finally(() => {
            lockState.locked = false
            lockWaiters.shift()?.()
          })
      }

      if (lockState.locked) {
        lockWaiters.push(start)
        options.signal.addEventListener("abort", () => reject(new Error("aborted")))
      } else {
        start()
      }
    }),
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  channels.clear()
  lockWaiters.length = 0
  lockState.locked = false
  database.connect.mockClear()
})

test.live(
  "queries dispatch without polling and other tabs wait for the transaction",
  Effect.fn(function* () {
    const { open } = yield* Effect.tryPromise(() => import("../src/turso-browser-database.js"))
    vi.useFakeTimers({
      toFake: ["setTimeout", "setInterval"],
    })
    vi.stubGlobal("BroadcastChannel", FakeChannel)
    vi.stubGlobal("navigator", {
      locks,
    })

    yield* Effect.scoped(
      Effect.gen(function* () {
        const leader = yield* open("shared.db")
        const follower = yield* open("shared.db")

        yield* leader.execute({
          sql: "BEGIN",
          params: [],
          raw: false,
          safeIntegers: false,
        })

        const followerQuery = yield* Effect.forkChild(
          follower.execute({
            sql: "SELECT follower",
            params: [],
            raw: false,
            safeIntegers: false,
          }),
        )

        const leaderQuery = yield* leader.execute({
          sql: "SELECT leader",
          params: [],
          raw: false,
          safeIntegers: false,
        })

        expect(leaderQuery).toEqual([
          {
            sql: "SELECT leader",
          },
        ])

        yield* leader.execute({
          sql: "COMMIT",
          params: [],
          raw: false,
          safeIntegers: false,
        })

        expect(yield* Fiber.join(followerQuery)).toEqual([
          {
            sql: "SELECT follower",
          },
        ])

        expect(database.connect).toHaveBeenCalledTimes(1)
      }),
    )
  }),
)

test.live(
  "a follower takes over after the leader closes",
  Effect.fn(function* () {
    const { open } = yield* Effect.tryPromise(() => import("../src/turso-browser-database.js"))
    vi.stubGlobal("BroadcastChannel", FakeChannel)
    vi.stubGlobal("navigator", {
      locks,
    })

    yield* Effect.scoped(
      Effect.gen(function* () {
        const first = yield* open("failover.db")
        const second = yield* open("failover.db")

        yield* first.execute({
          sql: "SELECT first",
          params: [],
          raw: false,
          safeIntegers: false,
        })

        yield* first.close()

        expect(
          yield* second.execute({
            sql: "SELECT second",
            params: [],
            raw: false,
            safeIntegers: false,
          }),
        ).toEqual([
          {
            sql: "SELECT second",
          },
        ])

        expect(database.connect).toHaveBeenCalledTimes(2)
      }),
    )
  }),
)

test.live(
  "rollback to a savepoint keeps other tabs outside the transaction",
  Effect.fn(function* () {
    const { open } = yield* Effect.tryPromise(() => import("../src/turso-browser-database.js"))
    vi.stubGlobal("BroadcastChannel", FakeChannel)
    vi.stubGlobal("navigator", {
      locks,
    })

    yield* Effect.scoped(
      Effect.gen(function* () {
        const leader = yield* open("savepoint.db")
        const follower = yield* open("savepoint.db")

        yield* leader.execute({
          sql: "BEGIN",
          params: [],
          raw: false,
          safeIntegers: false,
        })

        yield* leader.execute({
          sql: "SAVEPOINT nested",
          params: [],
          raw: false,
          safeIntegers: false,
        })

        let followerCompleted = false

        const query = yield* Effect.forkChild(
          follower
            .execute({
              sql: "SELECT follower",
              params: [],
              raw: false,
              safeIntegers: false,
            })
            .pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  followerCompleted = true
                }),
              ),
            ),
        )

        yield* Effect.yieldNow

        yield* leader.execute({
          sql: "ROLLBACK TO SAVEPOINT nested",
          params: [],
          raw: false,
          safeIntegers: false,
        })

        yield* leader.execute({
          sql: "SELECT leader",
          params: [],
          raw: false,
          safeIntegers: false,
        })

        expect(followerCompleted).toBe(false)

        yield* leader.execute({
          sql: "COMMIT",
          params: [],
          raw: false,
          safeIntegers: false,
        })

        yield* Fiber.join(query)
        expect(followerCompleted).toBe(true)
      }),
    )
  }),
)

test.live(
  "connection options do not split ownership of the same OPFS path",
  Effect.fn(function* () {
    const { open } = yield* Effect.tryPromise(() => import("../src/turso-browser-database.js"))
    vi.stubGlobal("BroadcastChannel", FakeChannel)
    vi.stubGlobal("navigator", {
      locks,
    })

    yield* Effect.scoped(
      Effect.gen(function* () {
        const first = yield* open("options.db", {})
        const second = yield* open("options.db", {
          experimental: [],
        })

        yield* first.execute({
          sql: "SELECT first",
          params: [],
          raw: false,
          safeIntegers: false,
        })

        expect(
          yield* second.execute({
            sql: "SELECT second",
            params: [],
            raw: false,
            safeIntegers: false,
          }),
        ).toEqual([
          {
            sql: "SELECT second",
          },
        ])

        expect(database.connect).toHaveBeenCalledTimes(1)
      }),
    )
  }),
)
