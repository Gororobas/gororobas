import { Effect, Fiber } from "effect"
import { afterEach, expect, test, vi } from "vitest"

import { open } from "../src/turso-browser-database.js"

const database = vi.hoisted(() => ({
  connect: vi.fn(async () => ({
    prepare: async (sql: string) => ({
      reader: sql.startsWith("SELECT"),
      all: async () => [{ sql }],
      run: async () => ({ changes: 1, lastInsertRowid: 1 }),
      raw: () => {},
      safeIntegers: () => {},
      close: () => {},
    }),
    close: async () => {},
  })),
}))
vi.mock("@tursodatabase/database-wasm/vite", () => database)

const channels = new Map<string, Set<FakeChannel>>()
class FakeChannel {
  onmessage: ((event: MessageEvent) => void) | null = null
  constructor(readonly name: string) {
    const peers = channels.get(name) ?? new Set<FakeChannel>()
    peers.add(this)
    channels.set(name, peers)
  }
  postMessage(message: unknown) {
    for (const peer of channels.get(this.name) ?? []) {
      if (peer !== this) {
        queueMicrotask(() => peer.onmessage?.(new MessageEvent("message", { data: message })))
      }
    }
  }
  close() {
    channels.get(this.name)?.delete(this)
  }
}

const lockWaiters: Array<() => void> = []
const lockState = { locked: false }
const locks = {
  request: (_name: string, options: { signal: AbortSignal }, callback: () => Promise<void>) =>
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

test("queries dispatch without polling and other tabs wait for the transaction", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval"] })
  vi.stubGlobal("BroadcastChannel", FakeChannel)
  vi.stubGlobal("navigator", { locks })
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const leader = yield* open("shared.db")
        const follower = yield* open("shared.db")
        yield* leader.execute("BEGIN", [], false, false)
        const followerQuery = yield* Effect.forkChild(
          follower.execute("SELECT follower", [], false, false),
        )
        const leaderQuery = yield* leader.execute("SELECT leader", [], false, false)
        expect(leaderQuery).toEqual([{ sql: "SELECT leader" }])
        yield* leader.execute("COMMIT", [], false, false)
        expect(yield* Fiber.join(followerQuery)).toEqual([{ sql: "SELECT follower" }])
        expect(database.connect).toHaveBeenCalledTimes(1)
      }),
    ),
  )
})

test("a follower takes over after the leader closes", async () => {
  vi.stubGlobal("BroadcastChannel", FakeChannel)
  vi.stubGlobal("navigator", { locks })
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const first = yield* open("failover.db")
        const second = yield* open("failover.db")
        yield* first.execute("SELECT first", [], false, false)
        yield* first.close()
        expect(yield* second.execute("SELECT second", [], false, false)).toEqual([
          { sql: "SELECT second" },
        ])
        expect(database.connect).toHaveBeenCalledTimes(2)
      }),
    ),
  )
})

test("rollback to a savepoint keeps other tabs outside the transaction", async () => {
  vi.stubGlobal("BroadcastChannel", FakeChannel)
  vi.stubGlobal("navigator", { locks })
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const leader = yield* open("savepoint.db")
        const follower = yield* open("savepoint.db")
        yield* leader.execute("BEGIN", [], false, false)
        yield* leader.execute("SAVEPOINT nested", [], false, false)
        let followerCompleted = false
        const query = yield* Effect.forkChild(
          follower.execute("SELECT follower", [], false, false).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                followerCompleted = true
              }),
            ),
          ),
        )
        yield* Effect.yieldNow
        yield* leader.execute("ROLLBACK TO SAVEPOINT nested", [], false, false)
        yield* leader.execute("SELECT leader", [], false, false)
        expect(followerCompleted).toBe(false)
        yield* leader.execute("COMMIT", [], false, false)
        yield* Fiber.join(query)
        expect(followerCompleted).toBe(true)
      }),
    ),
  )
})

test("connection options do not split ownership of the same OPFS path", async () => {
  vi.stubGlobal("BroadcastChannel", FakeChannel)
  vi.stubGlobal("navigator", { locks })
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const first = yield* open("options.db", {})
        const second = yield* open("options.db", { experimental: [] })
        yield* first.execute("SELECT first", [], false, false)
        expect(yield* second.execute("SELECT second", [], false, false)).toEqual([
          { sql: "SELECT second" },
        ])
        expect(database.connect).toHaveBeenCalledTimes(1)
      }),
    ),
  )
})
