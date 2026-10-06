import type { Database, connect } from "@tursodatabase/database-wasm/vite"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"

class TursoBrowserDatabaseError extends Schema.TaggedError<TursoBrowserDatabaseError>()(
  "TursoBrowserDatabaseError",
  {
    message: Schema.String,
  },
) {}

// Keep native driver errors intact: SqlError classification reads their SQLite code.
const isDriverError = Schema.is(Schema.instanceOf(Error))

export type DatabaseOptions = NonNullable<Parameters<typeof connect>[1]>

type Request = {
  kind: "request"
  id: string
  sender: string
  target: string
  sql: string
  params: ReadonlyArray<unknown>
  raw: boolean
  values: boolean
  safeIntegers: boolean
}

type Response = {
  kind: "response"
  id: string
  target: string
  result?: unknown
  error?: { message: string; code?: string | number }
}

type Announcement = { kind: "leader"; id: string }

type Message =
  | Request
  | Response
  | Announcement
  | { kind: "hello" }
  | { kind: "released"; id: string }

type Pending = {
  request: Omit<Request, "target">
  target?: string
  // oxlint-disable-next-line effect/no-unknown-parameters -- The WASM protocol returns either rows or write metadata; the SQL adapter interprets the driver result after resolution.
  resolve: (rows: unknown) => void
  reject: (error: Error) => void
}

export type BrowserDatabase = {
  execute: (input: {
    sql: string
    params: ReadonlyArray<unknown>
    raw: boolean
    safeIntegers: boolean
    values?: boolean | undefined
  }) => Effect.Effect<unknown, Error>
  close: () => Effect.Effect<void>
}

const openRaw = async (path: string, options: DatabaseOptions = {}): Promise<BrowserDatabase> => {
  if (!navigator.locks || !globalThis.BroadcastChannel) {
    throw new TursoBrowserDatabaseError({
      message: "Turso requires Web Locks and BroadcastChannel",
    })
  }

  const keyDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path))
  const name = `turso:${Array.from(new Uint8Array(keyDigest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`
  const id = crypto.randomUUID()
  const channel = new BroadcastChannel(path === ":memory:" ? `${name}:${id}` : name)
  // oxlint-disable-next-line effect/avoid-native-object-helpers -- Pending native Promise callbacks require insertion-ordered dispatch; preserve request order while callbacks remove entries.
  const pending = new Map<string, Pending>()
  const queue: Array<Request> = []
  let database: Database | undefined
  let leader: string | undefined
  let transactionOwner: string | undefined
  let processing = false
  let closed = false
  let failure: Error | undefined
  let releaseLock!: () => void
  const lockLifetime = new Promise<void>((resolve) => {
    releaseLock = resolve
  })
  const electionAbort = new AbortController()

  const announce = () => channel.postMessage({ kind: "leader", id })

  const processQueue = async () => {
    if (processing || !database) {
      return
    }
    processing = true

    // oxlint-disable-next-line effect/avoid-try-catch -- The native async driver callback must release statement/lock resources in finally and serialize query failures for other tabs.
    try {
      // oxlint-disable-next-line effect/imperative-loops, effect/no-length-comparison, effect/prefer-arr-match -- Queries can arrive while a statement awaits and transaction ownership selects the next request; a fixed array traversal would miss or reorder work.
      while (queue.length > 0) {
        const index = transactionOwner
          ? queue.findIndex((request) => request.sender === transactionOwner)
          : 0
        if (index < 0) {
          break
        }
        const [request] = queue.splice(index, 1)
        if (request === undefined) break

        // oxlint-disable-next-line effect/avoid-try-catch -- The native async driver callback must release statement/lock resources in finally and serialize query failures for other tabs.
        try {
          const statement = await database.prepare(request.sql)

          // oxlint-disable-next-line effect/avoid-try-catch -- The native async driver callback must release statement/lock resources in finally and serialize query failures for other tabs.
          try {
            if (request.safeIntegers) {
              statement.safeIntegers(true)
            }
            if (request.values) {
              statement.raw(true)
            }
            const result = statement.reader
              ? await statement.all(...request.params)
              : await statement.run(...request.params)
            const rows = statement.reader ? result : request.raw ? result : []
            if (/^\s*BEGIN\b/i.test(request.sql)) {
              transactionOwner = request.sender
            }
            if (/^\s*(?:COMMIT|END|ROLLBACK(?!\s+(?:TRANSACTION\s+)?TO\b))\b/i.test(request.sql)) {
              transactionOwner = undefined
            }

            const response: Response = {
              kind: "response",
              id: request.id,
              target: request.sender,
              result: rows,
            }

            if (request.sender === id) {
              receive(response)
            } else {
              channel.postMessage(response)
            }
          } finally {
            statement.close()
          }
        } catch (cause) {
          const error: NonNullable<Response["error"]> = {
            message: isDriverError(cause) ? cause.message : String(cause),
          }

          if (
            Predicate.isObjectOrArray(cause) &&
            "code" in cause &&
            (Predicate.isString(cause.code) || Predicate.isNumber(cause.code))
          ) {
            error.code = cause.code
          }

          const response: Response = {
            kind: "response",
            id: request.id,
            target: request.sender,
            error,
          }

          if (request.sender === id) {
            receive(response)
          } else {
            channel.postMessage(response)
          }
        }
      }
    } finally {
      processing = false
    }
  }

  const rejectPending = (target: string) => {
    pending.forEach((entry, requestId) => {
      if (entry.target === target) {
        entry.reject(
          new TursoBrowserDatabaseError({ message: "Turso leader changed during a query" }),
        )
        pending.delete(requestId)
      }
    })
  }

  const receive = (message: Message) => {
    if (closed) {
      return
    }

    if (message.kind === "hello") {
      if (database) {
        announce()
      }
    } else if (message.kind === "leader") {
      if (leader && leader !== message.id) {
        rejectPending(leader)
      }
      leader = message.id
      dispatchPending()
    } else if (message.kind === "released") {
      if (leader === message.id) {
        rejectPending(leader)
        leader = undefined
      }
    } else if (message.kind === "request") {
      if (database && message.target === id) {
        queue.push(message)
        void processQueue()
      }
    } else if (message.target === id) {
      const entry = pending.get(message.id)

      if (entry) {
        pending.delete(message.id)

        if (message.error) {
          entry.reject(
            Object.assign(
              new TursoBrowserDatabaseError({ message: message.error.message }),
              message.error,
            ),
          )
        } else {
          entry.resolve(message.result ?? [])
        }
      }
    }
  }

  channel.onmessage = (event: MessageEvent<Message>) => receive(event.data)

  const election = navigator.locks.request(
    path === ":memory:" ? `${name}:${id}` : name,
    { signal: electionAbort.signal },
    async () => {
      if (closed) {
        return
      }

      // oxlint-disable-next-line effect/avoid-try-catch -- The native async driver callback must release statement/lock resources in finally and serialize query failures for other tabs.
      try {
        const { connect } = await import("@tursodatabase/database-wasm/vite")
        database = await connect(path, options)
        receive({ kind: "leader", id })
        announce()
        await lockLifetime
      } finally {
        if (database) {
          await database.close()
        }
        database = undefined
      }
    },
  )

  void election.catch((cause) => {
    if (closed) {
      return
    }
    const error = isDriverError(cause)
      ? cause
      : new TursoBrowserDatabaseError({ message: String(cause) })
    failure = error
    pending.forEach((entry) => {
      entry.reject(error)
    })
    pending.clear()
  })

  const dispatchPending = () => {
    pending.forEach((entry) => {
      if (!entry.target && leader) {
        entry.target = leader
        const request = { ...entry.request, target: leader }

        if (leader === id) {
          receive(request)
        } else {
          channel.postMessage(request)
        }
      }
    })
  }

  channel.postMessage({ kind: "hello" })

  return {
    execute: ({ sql, params, raw, safeIntegers, values = false }) =>
      Effect.uninterruptible(
        Effect.tryPromise({
          try: () =>
            new Promise<unknown>((resolve, reject) => {
              if (closed) {
                reject(new TursoBrowserDatabaseError({ message: "Turso database is closed" }))
                return
              }
              if (failure) {
                reject(failure)
                return
              }

              const request: Omit<Request, "target"> = {
                kind: "request",
                id: crypto.randomUUID(),
                sender: id,
                sql,
                params,
                raw,
                values,
                safeIntegers,
              }

              pending.set(request.id, { request, resolve, reject })
              dispatchPending()
            }),
          catch: (cause) =>
            isDriverError(cause)
              ? cause
              : new TursoBrowserDatabaseError({ message: String(cause) }),
        }),
      ),
    close: () =>
      Effect.tryPromise(async () => {
        if (closed) {
          return
        }
        if (leader === id) {
          channel.postMessage({ kind: "released", id })
        }
        closed = true
        pending.forEach((entry) => {
          entry.reject(new TursoBrowserDatabaseError({ message: "Turso database is closed" }))
        })
        pending.clear()
        releaseLock()
        electionAbort.abort()
        await election.catch(() => {})
        channel.close()
      }).pipe(Effect.orDie),
  }
}

export const open = (
  path: string,
  options: DatabaseOptions = {},
): Effect.Effect<BrowserDatabase, Error, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: () => openRaw(path, options),
      catch: (cause) =>
        isDriverError(cause) ? cause : new TursoBrowserDatabaseError({ message: String(cause) }),
    }),
    (database) => database.close(),
  )
