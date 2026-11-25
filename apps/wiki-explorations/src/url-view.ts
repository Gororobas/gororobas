import { Atom } from "effect/reactivity"

import type { PipelineMode } from "./pipeline-view.js"

/** What the canvas shows, kept in the URL so Back and Forward retrace it. */
export type View = { node?: string | undefined; pipeline?: string | undefined; mode: PipelineMode }

export type Location = View & { canvas?: string | undefined }

function read(): Location {
  const params = new URLSearchParams(location.search)

  return {
    canvas: params.get("canvas") ?? undefined,
    node: params.get("node") ?? undefined,
    pipeline: params.get("pipeline") ?? undefined,
    mode: params.get("mode") === "steps" ? "steps" : "graph",
  }
}

/** Write `push: true` to add a history entry; selection clicks replace the current one instead. */
export const locationAtom = Atom.writable(
  (get) => {
    const sync = () => get.setSelf(read())
    window.addEventListener("popstate", sync)
    get.addFinalizer(() => window.removeEventListener("popstate", sync))
    return read()
  },
  (context, { to, push = false }: { to: Location; push?: boolean }) => {
    const params = new URLSearchParams()
    if (to.canvas) params.set("canvas", to.canvas)
    if (to.pipeline) params.set("pipeline", to.pipeline)
    if (to.pipeline && to.mode === "steps") params.set("mode", "steps")
    if (to.node) params.set("node", to.node)

    const url = `?${params}`
    if (url !== location.search) history[push ? "pushState" : "replaceState"](null, "", url)
    context.setSelf(to)
  },
).pipe(Atom.keepAlive)
