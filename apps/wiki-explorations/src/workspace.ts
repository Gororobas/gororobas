import { Context, Effect, Layer, Option, PubSub, Schema, Stream } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity"

import {
  ApiProblem,
  CanvasDocument,
  CanvasEntry,
  CanvasHistoryComparison,
  canvasChangedEvent,
} from "./canvas-api.js"
import { diffCanvas } from "./canvas-diff.js"
import {
  hasUnsavedChanges,
  markSaved,
  openSession,
  receive,
  step,
  type CanvasSession,
} from "./canvas-session.js"
import type { Canvas } from "./graph.js"
import { locationAtom } from "./url-view.js"

const endpoint = "/api/canvases"

export class CanvasStorageError extends Schema.TaggedError<CanvasStorageError>()(
  "CanvasStorageError",
  { message: Schema.String },
) {}

class CanvasClient extends Context.Service<CanvasClient>()("wiki-explorations/CanvasClient", {
  make: Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(HttpClientRequest.setHeader("x-wiki-explorations", "1")),
    )

    /** Resolves with the JSON body, or fails with the server's `{ error }` message. */
    const send = (request: HttpClientRequest.HttpClientRequest) =>
      client.execute(request).pipe(
        Effect.flatMap((response) =>
          response.status < 400
            ? response.json
            : response.json.pipe(
                // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- HTTP JSON is untrusted.
                Effect.flatMap(Schema.decodeUnknownEffect(ApiProblem)),
                Effect.flatMap(({ error }) => new CanvasStorageError({ message: error })),
              ),
        ),
      )

    const decoded =
      <A>(schema: Schema.Codec<A, unknown>) =>
      (request: HttpClientRequest.HttpClientRequest) =>
        send(request).pipe(
          // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- HTTP JSON is untrusted.
          Effect.flatMap(Schema.decodeUnknownEffect(schema)),
          Effect.mapError((error) =>
            error instanceof CanvasStorageError
              ? error
              : new CanvasStorageError({ message: "Could not reach canvas storage." }),
          ),
        )

    return {
      list: decoded(Schema.Array(CanvasEntry))(HttpClientRequest.get(endpoint)),
      read: (id: string) => decoded(CanvasDocument)(HttpClientRequest.get(`${endpoint}/${id}`)),
      write: ({ id, revision, canvas }: CanvasDocument) =>
        decoded(CanvasDocument)(
          HttpClientRequest.put(`${endpoint}/${id}`).pipe(
            HttpClientRequest.bodyJsonUnsafe({ id, revision, canvas }),
          ),
        ),
      create: (body: { title: string; from: string | undefined }) =>
        decoded(CanvasDocument)(
          HttpClientRequest.post(endpoint).pipe(HttpClientRequest.bodyJsonUnsafe(body)),
        ),
      history: (id: string, ref: string) =>
        decoded(CanvasHistoryComparison)(
          HttpClientRequest.get(`${endpoint}/${id}/history`, { urlParams: { ref } }),
        ),
    }
  }),
}) {}

/** Fans the server's change stream out to every atom that follows a canvas. */
class CanvasChanges extends Context.Service<CanvasChanges>()("wiki-explorations/CanvasChanges", {
  make: Effect.gen(function* () {
    const changes = yield* PubSub.unbounded<CanvasDocument>()
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Server-Sent Event data is untrusted.
    const decode = Schema.decodeUnknownOption(Schema.fromJsonString(CanvasDocument))

    yield* Effect.acquireRelease(
      Effect.sync(() => {
        // shortcut: changes made while EventSource reconnects are missed until that canvas changes again.
        const source = new EventSource(`${endpoint}/events`)

        source.addEventListener(canvasChangedEvent, ({ data }) => {
          Option.map(decode(data), (document) => PubSub.publishUnsafe(changes, document))
        })

        return source
      }),
      (source) => Effect.sync(() => source.close()),
    )

    /** Subscribe before loading what the changes apply to, so none land in between. */
    return { subscribe: PubSub.subscribe(changes) }
  }),
}) {}

const runtime = Atom.runtime(
  Layer.mergeAll(
    Layer.effect(CanvasClient, CanvasClient.make).pipe(Layer.provide(FetchHttpClient.layer)),
    Layer.effect(CanvasChanges, CanvasChanges.make),
  ),
)

export const entriesAtom = runtime.atom(
  Stream.unwrap(
    Effect.gen(function* () {
      const client = yield* CanvasClient
      const changes = yield* (yield* CanvasChanges).subscribe

      return Stream.fromSubscription(changes).pipe(
        Stream.as(undefined),
        Stream.prepend([undefined]),
        Stream.mapEffect(() => client.list),
      )
    }),
  ),
)

/** The canvas in the URL, or the first one when the URL names none that exists. */
export const currentCanvasIdAtom = Atom.make((get) => {
  const requested = get(locationAtom).canvas
  const entries = AsyncResult.value(get(entriesAtom))
  if (Option.isNone(entries)) return requested
  return entries.value.some(({ id }) => id === requested) ? requested : entries.value[0]?.id
})

/** Kept alive so undo history and unsaved edits survive switching canvases. */
export const sessionAtom = Atom.family((_id: string) =>
  Atom.make(Option.none<CanvasSession>()).pipe(Atom.keepAlive),
)

const autosaveDelay = "180 millis"

/** Loads a canvas, then keeps it in step with disk: autosaves edits and applies changes made elsewhere. */
export const sessionSyncAtom = Atom.family((id: string) =>
  runtime
    .atom((get) =>
      Effect.gen(function* () {
        const client = yield* CanvasClient
        const changes = yield* (yield* CanvasChanges).subscribe
        const state = sessionAtom(id)
        const update = (f: (session: CanvasSession) => CanvasSession) =>
          get.set(state, Option.map(get.once(state), f))

        if (Option.isNone(get.once(state))) {
          get.set(state, Option.some(openSession(yield* client.read(id))))
        }

        yield* Stream.fromSubscription(changes).pipe(
          Stream.filter((document) => document.id === id),
          Stream.runForEach((document) => Effect.sync(() => update((s) => receive(s, document)))),
          Effect.forkScoped,
        )

        // A failed write is retried by the next edit or by clearing `saveError`, not in a loop.
        let failed: Canvas | undefined

        const save = Effect.gen(function* () {
          const session = Option.getOrUndefined(get.once(state))
          if (!session || !hasUnsavedChanges(session)) return
          if (session.saveError !== undefined && session.canvas === failed) return
          const saved = session.canvas

          const { revision } = yield* client.write({
            id,
            revision: session.revision,
            canvas: saved,
          })

          update((s) => markSaved(s, { saved, revision }))
        }).pipe(
          Effect.catchTag("CanvasStorageError", (error) =>
            Effect.sync(() => {
              failed = Option.getOrUndefined(get.once(state))?.canvas
              update((s) => ({ ...s, saveError: error.message }))
            }),
          ),
        )

        yield* get.stream(state).pipe(
          Stream.debounce(autosaveDelay),
          Stream.runForEach(() => save),
          Effect.forkScoped,
        )

        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const warn = (event: BeforeUnloadEvent) => {
              if (Option.exists(get.once(state), hasUnsavedChanges)) event.preventDefault()
            }
            window.addEventListener("beforeunload", warn)
            return warn
          }),
          (warn) => Effect.sync(() => window.removeEventListener("beforeunload", warn)),
        )
      }),
    )
    .pipe(Atom.keepAlive),
)

/** The current canvas's session; mounting it loads the canvas and keeps it in sync. */
export const currentSessionAtom = Atom.writable(
  (get) => {
    const id = get(currentCanvasIdAtom)
    if (id === undefined) return Option.none<CanvasSession>()
    get(sessionSyncAtom(id))
    return get(sessionAtom(id))
  },
  (context, session: Option.Option<CanvasSession>) => {
    const id = context.get(currentCanvasIdAtom)
    if (id !== undefined) context.set(sessionAtom(id), session)
  },
)

/** Why the current canvas couldn't load, if it couldn't. */
export const currentLoadErrorAtom = Atom.make((get) => {
  const id = get(currentCanvasIdAtom)
  return id === undefined ? Option.none() : AsyncResult.error(get(sessionSyncAtom(id)))
})

/** Writes `from` before forking it: the server copies the canvas from disk. */
export const createCanvasAtom = runtime.fn(
  Effect.fnUntraced(function* ({ title, from }: { title: string; from: string | undefined }, get) {
    if (from !== undefined) {
      const registry = yield* AtomRegistry.AtomRegistry

      yield* AtomRegistry.toStream(registry, sessionAtom(from)).pipe(
        Stream.filter((session) => !Option.exists(session, hasUnsavedChanges)),
        Stream.take(1),
        Stream.runDrain,
        Effect.timeoutOrElse({
          duration: "5 seconds",
          orElse: () =>
            Effect.fail(new CanvasStorageError({ message: "Save the canvas before forking it." })),
        }),
      )
    }

    const document = yield* (yield* CanvasClient).create({ title, from })
    get.set(sessionAtom(document.id), Option.some(openSession(document)))
    get.set(locationAtom, { to: { canvas: document.id, mode: "graph" }, push: true })
  }),
)

/** Refreshed on window focus: commits happen in another app. */
export const canvasHistoryAtom = Atom.family((id: string) =>
  Atom.family((ref: string) =>
    runtime
      .atom(CanvasClient.use((client) => client.history(id, ref)))
      .pipe(Atom.refreshOnWindowFocus),
  ),
)

export type NodeChangeStatus = "Added" | "Edited"

/** Nodes of the current canvas added or edited since HEAD. */
export const nodeStatusesAtom = Atom.make((get): ReadonlyMap<string, NodeChangeStatus> => {
  const id = get(currentCanvasIdAtom)
  if (id === undefined) return new Map()
  const head = AsyncResult.value(get(canvasHistoryAtom(id)("HEAD")))
  const session = get(sessionAtom(id))
  if (Option.isNone(head) || Option.isNone(session)) return new Map()

  return new Map(
    diffCanvas(head.value.baseline, session.value.canvas).nodes.flatMap(({ id, status }) =>
      status === "Removed" ? [] : [[id, status] as const],
    ),
  )
})

export const searchOpenAtom = Atom.make(false)

/** Open with a node to scroll to its changes. */
export const historyDialogAtom = Atom.make<{ focusedNode?: string } | undefined>(undefined)

/** ⌘K search and ⌘Z / ⇧⌘Z undo and redo; mount it once. */
export const keyboardShortcutsAtom = Atom.make((get) => {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey) return
    if (!(event.metaKey || event.ctrlKey)) return
    const id = get.once(currentCanvasIdAtom)
    if (id === undefined) return
    const key = event.key.toLowerCase()

    if (key === "k") {
      event.preventDefault()
      get.set(searchOpenAtom, !get.once(searchOpenAtom))
      return
    }

    if (
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable || event.target.closest("input, textarea, select"))
    ) {
      return
    }

    if (key === "z" || (event.ctrlKey && key === "y")) {
      event.preventDefault()
      const direction = event.shiftKey || key === "y" ? "redo" : "undo"
      const session = sessionAtom(id)
      get.set(
        session,
        Option.map(get.once(session), (s) => step(s, direction)),
      )
    }
  }

  window.addEventListener("keydown", onKeyDown)
  get.addFinalizer(() => window.removeEventListener("keydown", onKeyDown))
})
