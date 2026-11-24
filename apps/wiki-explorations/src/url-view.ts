import { useEffect, useState } from "react"

import type { PipelineMode } from "./pipeline-view.js"

/** What the canvas shows, kept in the URL next to `?canvas=` so Back and Forward retrace it. */
export type View = { node?: string | undefined; pipeline?: string | undefined; mode: PipelineMode }

function read(): View {
  const params = new URLSearchParams(location.search)

  return {
    node: params.get("node") ?? undefined,
    pipeline: params.get("pipeline") ?? undefined,
    mode: params.get("mode") === "steps" ? "steps" : "graph",
  }
}

export function useUrlView() {
  const [view, setView] = useState(read)

  useEffect(() => {
    const sync = () => setView(read())
    window.addEventListener("popstate", sync)
    return () => window.removeEventListener("popstate", sync)
  }, [])

  /** `push` adds a history entry; selection clicks replace the current one instead. */
  function navigate(next: View, { push = false } = {}) {
    const params = new URLSearchParams(location.search)
    for (const key of ["node", "pipeline", "mode"] as const) params.delete(key)
    if (next.pipeline) params.set("pipeline", next.pipeline)
    if (next.pipeline && next.mode === "steps") params.set("mode", "steps")
    if (next.node) params.set("node", next.node)

    const url = `?${params}`
    if (url !== location.search) history[push ? "pushState" : "replaceState"](null, "", url)
    setView(next)
  }

  return { view, navigate, sync: () => setView(read()) }
}
