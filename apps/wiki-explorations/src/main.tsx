import { useAtom, useAtomMount, useAtomSet, useAtomValue } from "@effect/atom-react"
import { ReactFlowProvider } from "@xyflow/react"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Check, ChevronDown, GitFork, Plus, Redo2, Search, Undo2 } from "lucide-react"
import { useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import "@xyflow/react/dist/style.css"
import "highlight.js/styles/github.css"

import "./styles.css"
import type { CanvasEntry } from "./canvas-api.js"
import { CanvasEditor } from "./canvas-editor.js"
import { edit, step, type CanvasSession } from "./canvas-session.js"
import { CommandPalette } from "./command-palette.js"
import type { Canvas } from "./graph.js"
import { HistoryDialog } from "./history-dialog.js"
import { PipelineView } from "./pipeline-view.js"
import { locationAtom, type View } from "./url-view.js"
import {
  createCanvasAtom,
  currentCanvasIdAtom,
  currentLoadErrorAtom,
  currentSessionAtom,
  entriesAtom,
  historyDialogAtom,
  keyboardShortcutsAtom,
  searchOpenAtom,
} from "./workspace.js"

function CanvasView({
  canvas,
  onEdit,
  view,
  navigate,
  reveal,
}: {
  canvas: Canvas
  onEdit: (next: Canvas, group?: symbol) => void
  view: View
  navigate: (next: View, options?: { push?: boolean }) => void
  reveal: number
}) {
  const { pipeline, mode, node } = view
  const select = (id: string | undefined) => navigate({ ...view, node: id })
  const openPipeline = (id: string) => navigate({ mode, pipeline: id }, { push: true })

  // Undo or a delete can remove the focused node; fall back to the whole canvas.
  return pipeline && canvas.nodes.some(({ id }) => id === pipeline) ? (
    <PipelineView
      canvas={canvas}
      focusId={pipeline}
      mode={mode}
      selected={node}
      onSelect={select}
      onEdit={onEdit}
      onFocus={openPipeline}
      onMode={(next) => navigate({ ...view, mode: next })}
      onClose={() => navigate({ mode, node: pipeline }, { push: true })}
    />
  ) : (
    <CanvasEditor
      canvas={canvas}
      onEdit={onEdit}
      onOpenPipeline={openPipeline}
      selected={node}
      onSelect={select}
      reveal={reveal}
    />
  )
}

function CanvasMenu({
  entries,
  current,
  loading,
  onSelect,
  onAction,
}: {
  entries: ReadonlyArray<CanvasEntry>
  current: { id: string; title: string } | undefined
  loading: boolean
  onSelect: (id: string) => void
  onAction: (action: "new" | "fork") => void
}) {
  const menu = useRef<HTMLDivElement>(null)
  const run = (action: () => void) => {
    menu.current?.hidePopover()
    action()
  }

  return (
    <>
      <button
        className="canvas-menu-button"
        popoverTarget="canvas-menu"
        disabled={loading && !current}
      >
        <span>{current?.title ?? "Select a canvas"}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <div ref={menu} id="canvas-menu" className="popover canvas-menu" popover="auto">
        {entries.map(({ id, title, forkedFrom }) => (
          <button
            key={id}
            aria-current={id === current?.id}
            disabled={loading}
            onClick={() => run(() => onSelect(id))}
          >
            <Check size={15} aria-hidden="true" className="canvas-menu-check" />
            <span>
              {title}
              {forkedFrom && <span className="fork-label"> · fork of {forkedFrom}</span>}
            </span>
          </button>
        ))}
        <hr />
        <button disabled={loading || !current} onClick={() => run(() => onAction("fork"))}>
          <GitFork size={15} aria-hidden="true" />
          Fork canvas
        </button>
        <button disabled={loading} onClick={() => run(() => onAction("new"))}>
          <Plus size={15} aria-hidden="true" />
          New canvas
        </button>
      </div>
    </>
  )
}

function App() {
  useAtomMount(keyboardShortcutsAtom)
  const entries = useAtomValue(entriesAtom)
  const currentId = useAtomValue(currentCanvasIdAtom)
  const [session, setSession] = useAtom(currentSessionAtom)
  const loadError = useAtomValue(currentLoadErrorAtom)
  const [creation, create] = useAtom(createCanvasAtom)
  const location = useAtomValue(locationAtom)
  const setLocation = useAtomSet(locationAtom)
  const [searchOpen, setSearchOpen] = useAtom(searchOpenAtom)
  const [history, setHistory] = useAtom(historyDialogAtom)
  const [action, setAction] = useState<"new" | "fork">()
  const [title, setTitle] = useState("")
  const [reveal, setReveal] = useState(0)
  const current = Option.getOrUndefined(session)
  const loading =
    AsyncResult.isInitial(entries) || (currentId !== undefined && !current) || creation.waiting
  const update = (f: (session: CanvasSession) => CanvasSession) =>
    setSession((value) => Option.map(value, f))

  const error = [
    Option.getOrUndefined(AsyncResult.error(entries))?.message,
    Option.getOrUndefined(loadError)?.message,
    Option.getOrUndefined(AsyncResult.error(creation))?.message,
  ].find(Boolean)

  const navigate = (next: View, { push = false } = {}) =>
    setLocation({ to: { ...next, canvas: location.canvas }, push })

  function focusNode(id: string) {
    navigate({ mode: location.mode, node: id }, { push: true })
    setReveal((count) => count + 1)
  }

  return (
    <div className="workspace">
      <header className="workspace-header">
        <div className="brand">
          <span aria-hidden="true">⌘</span> Wiki Explorations
        </div>
        <CanvasMenu
          entries={Option.getOrElse(AsyncResult.value(entries), () => [])}
          current={current && { id: current.id, title: current.canvas.title }}
          loading={loading}
          onSelect={(id) => {
            setAction(undefined)
            setLocation({ to: { canvas: id, mode: "graph" }, push: true })
          }}
          onAction={(next) => {
            setTitle(next === "fork" ? `${current?.canvas.title ?? ""} fork` : "")
            setAction(next)
          }}
        />
        <div className="workspace-history">
          <button
            className="icon-only"
            aria-label="Undo"
            title="Undo (⌘Z)"
            aria-keyshortcuts="Meta+Z Control+Z"
            disabled={!current?.past.length}
            onClick={() => update((session) => step(session, "undo"))}
          >
            <Undo2 size={16} aria-hidden="true" />
          </button>
          <button
            className="icon-only"
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
            aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z Control+Y"
            disabled={!current?.future.length}
            onClick={() => update((session) => step(session, "redo"))}
          >
            <Redo2 size={16} aria-hidden="true" />
          </button>
          <button disabled={!current} onClick={() => setHistory({})}>
            Git history
          </button>
        </div>
        <button
          className="search-button"
          aria-keyshortcuts="Meta+K Control+K"
          disabled={!current}
          onClick={() => setSearchOpen(true)}
        >
          <Search size={15} aria-hidden="true" />
          Search
          <kbd>⌘K</kbd>
        </button>
      </header>
      {error && (
        <div className="workspace-error" role="alert">
          {error}
        </div>
      )}
      {current?.saveError && (
        <div className="workspace-error" role="alert">
          {current.saveError}
          <button onClick={() => update((session) => ({ ...session, saveError: undefined }))}>
            Retry save
          </button>
        </div>
      )}
      {action && (
        <form
          className="create-form"
          onSubmit={(event) => {
            event.preventDefault()
            setAction(undefined)
            create({ title, from: action === "fork" ? current?.id : undefined })
          }}
        >
          <label>
            {action === "fork" ? "Fork name" : "Canvas name"}
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <button className="primary" disabled={!title.trim() || loading}>
            {action === "fork" ? "Fork" : "Create"}
          </button>
          <button type="button" onClick={() => setAction(undefined)}>
            Cancel
          </button>
        </form>
      )}
      {current ? (
        <ReactFlowProvider key={current.id}>
          <div className="canvas-container" inert={creation.waiting}>
            <CanvasView
              canvas={current.canvas}
              onEdit={(canvas, group) => update((session) => edit(session, { canvas, group }))}
              view={location}
              navigate={navigate}
              reveal={reveal}
            />
          </div>
        </ReactFlowProvider>
      ) : (
        <div className="empty-workspace">
          {loading ? "Opening canvas…" : "Create a canvas to start exploring."}
        </div>
      )}
      {current && (
        <CommandPalette
          open={searchOpen}
          onOpenChange={setSearchOpen}
          nodes={current.canvas.nodes}
          onPick={(id) => {
            setSearchOpen(false)
            focusNode(id)
          }}
        />
      )}
      {current && (
        <HistoryDialog
          open={history !== undefined}
          onOpenChange={(open) => setHistory(open ? {} : undefined)}
          id={current.id}
          canvas={current.canvas}
          focusedNode={history?.focusedNode}
          onShowNode={(id) => {
            setHistory(undefined)
            focusNode(id)
          }}
        />
      )}
    </div>
  )
}

const root = document.getElementById("root")
if (root) createRoot(root).render(<App />)
