import { useEffect, useEffectEvent, useRef, useState } from "react"

import type { CanvasHistoryComparison } from "./git-history.js"
import type { Canvas } from "./graph.js"

type Entry = { id: string; title: string; forkedFrom?: string }
type Document = { id: string; revision: string; canvas: Canvas }

type CanvasHistory = {
  revision: string
  past: Canvas[]
  future: Canvas[]
  editGroup: symbol | undefined
}

const historyLimit = 100
const endpoint = "/api/canvases"

async function request<Value>(
  url: string,
  {
    method = "GET",
    body,
  }: { method?: string; body?: Document | { title: string; from: string | undefined } } = {},
): Promise<Value> {
  // oxlint-disable-next-line custom-lint-rules/no-direct-fetch -- This standalone browser app uses its same-origin development API.
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json", "x-wiki-explorations": "1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  if (!response.ok) {
    const { error } = await response.json()
    throw new Error(error)
  }
  return response.json()
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Could not reach canvas storage."

export const loadCanvasHistory = (id: string, ref: string) =>
  request<CanvasHistoryComparison>(`${endpoint}/${id}/history?${new URLSearchParams({ ref })}`)

export function useWorkspace() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [document, setDocument] = useState<Document>()
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const live = useRef<Document>(undefined)
  const persisted = useRef<Canvas>(undefined)
  const pending = useRef<Promise<void>>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const histories = useRef(new Map<string, CanvasHistory>())
  const activeHistory = document && histories.current.get(document.id)

  function open(value: Document) {
    const existing = histories.current.get(value.id)

    if (existing?.revision !== value.revision) {
      histories.current.set(value.id, {
        revision: value.revision,
        past: [],
        future: [],
        editGroup: undefined,
      })
    }

    live.current = value
    persisted.current = value.canvas
    setDocument(value)
    // Keep the node and pipeline params when reopening the canvas already in the URL.
    const current = new URLSearchParams(location.search).get("canvas")

    if (current !== value.id) {
      history[current ? "pushState" : "replaceState"](
        null,
        "",
        `?canvas=${encodeURIComponent(value.id)}`,
      )
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const list = await request<Entry[]>(endpoint)
        setEntries(list)

        const preferred = new URLSearchParams(location.search).get("canvas")
        const first = list.find(({ id }) => id === preferred) ?? list[0]
        if (first) open(await request<Document>(`${endpoint}/${first.id}`))
      } catch (failure) {
        setError(message(failure))
      } finally {
        setLoading(false)
      }
    }

    void load()
    const warn = (event: BeforeUnloadEvent) => {
      if (live.current?.canvas !== persisted.current) event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    window.addEventListener("keydown", onHistoryShortcut)

    return () => {
      window.removeEventListener("beforeunload", warn)
      window.removeEventListener("keydown", onHistoryShortcut)
      clearTimeout(timer.current)
    }
  }, [])

  function flush(): Promise<void> {
    clearTimeout(timer.current)
    if (pending.current) return pending.current

    const save = async () => {
      let current = live.current

      while (current && current.canvas !== persisted.current) {
        const result = await request<Document>(`${endpoint}/${current.id}`, {
          method: "PUT",
          body: current,
        })
        const canvasHistory = histories.current.get(current.id)
        if (canvasHistory) canvasHistory.revision = result.revision
        persisted.current = current.canvas
        if (live.current) live.current = { ...live.current, revision: result.revision }
        current = live.current
      }

      setError("")
    }

    pending.current = save().finally(() => {
      pending.current = undefined
    })
    return pending.current
  }

  function apply(canvas: Canvas) {
    if (!live.current) return
    live.current = { ...live.current, canvas }
    setDocument(live.current)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void flush().catch((failure: unknown) => setError(message(failure)))
    }, 180)
  }

  function edit(canvas: Canvas, group?: symbol) {
    const current = live.current
    if (!current || !activeHistory || current.canvas === canvas) return
    if (group === undefined || activeHistory.editGroup !== group) {
      activeHistory.past.push(current.canvas)
      if (activeHistory.past.length > historyLimit) activeHistory.past.shift()
    }

    activeHistory.editGroup = group
    activeHistory.future.length = 0
    apply(canvas)
  }

  function step(direction: "undo" | "redo") {
    const current = live.current
    if (loading || !current || !activeHistory) return
    const { past, future } = activeHistory
    const previous = (direction === "undo" ? past : future).pop()
    if (!previous) return
    const destination = direction === "undo" ? future : past
    destination.push(current.canvas)
    activeHistory.editGroup = undefined
    apply(previous)
  }

  const onHistoryShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey) return
    if (!(event.metaKey || event.ctrlKey)) return

    if (
      event.target instanceof HTMLElement &&
      (event.target.isContentEditable || event.target.closest("input, textarea, select"))
    ) {
      return
    }

    const key = event.key.toLowerCase()
    if (key === "z" || (event.ctrlKey && key === "y")) {
      event.preventDefault()
      step(event.shiftKey || key === "y" ? "redo" : "undo")
    }
  })

  async function navigate(load: () => Promise<Document>) {
    setLoading(true)

    try {
      await flush()
      open(await load())
    } catch (failure) {
      setError(message(failure))
    } finally {
      setLoading(false)
    }
  }

  return {
    entries,
    document,
    loading,
    error,
    edit,
    canUndo: Boolean(activeHistory?.past.length) && !loading,
    canRedo: Boolean(activeHistory?.future.length) && !loading,
    undo: () => step("undo"),
    redo: () => step("redo"),
    retry: () => flush().catch((failure: unknown) => setError(message(failure))),
    select: (id: string) => navigate(() => request<Document>(`${endpoint}/${id}`)),
    create: (title: string, from?: string) =>
      navigate(async () => {
        const created = await request<Document>(endpoint, { method: "POST", body: { title, from } })

        setEntries((list) => [
          ...list,
          {
            id: created.id,
            title: created.canvas.title,
            ...(from === undefined ? {} : { forkedFrom: from }),
          },
        ])

        return created
      }),
  }
}
