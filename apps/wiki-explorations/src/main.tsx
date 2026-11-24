import { ReactFlowProvider } from "@xyflow/react"
import { Check, ChevronDown, GitFork, Plus, Redo2, Search, Undo2 } from "lucide-react"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import "@xyflow/react/dist/style.css"
import "highlight.js/styles/github.css"

import "./styles.css"
import { CanvasEditor } from "./canvas-editor.js"
import { CommandPalette } from "./command-palette.js"
import type { Canvas } from "./graph.js"
import { HistoryDialog } from "./history-dialog.js"
import { PipelineView } from "./pipeline-view.js"
import { useUrlView, type View } from "./url-view.js"
import { useWorkspace } from "./workspace.js"

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
  workspace,
  onSelect,
  onAction,
}: {
  workspace: ReturnType<typeof useWorkspace>
  onSelect: (id: string) => void
  onAction: (action: "new" | "fork") => void
}) {
  const menu = useRef<HTMLDivElement>(null)
  const current = workspace.document
  const run = (action: () => void) => {
    menu.current?.hidePopover()
    action()
  }

  return (
    <>
      <button
        className="canvas-menu-button"
        popoverTarget="canvas-menu"
        disabled={workspace.loading && !current}
      >
        <span>{current?.canvas.title ?? "Select a canvas"}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <div ref={menu} id="canvas-menu" className="popover canvas-menu" popover="auto">
        {workspace.entries.map(({ id, title, forkedFrom }) => (
          <button
            key={id}
            aria-current={id === current?.id}
            disabled={workspace.loading}
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
        <button
          disabled={workspace.loading || !current}
          onClick={() => run(() => onAction("fork"))}
        >
          <GitFork size={15} aria-hidden="true" />
          Fork canvas
        </button>
        <button disabled={workspace.loading} onClick={() => run(() => onAction("new"))}>
          <Plus size={15} aria-hidden="true" />
          New canvas
        </button>
      </div>
    </>
  )
}

function App() {
  const workspace = useWorkspace()
  const { view, navigate, sync } = useUrlView()
  const [action, setAction] = useState<"new" | "fork">()
  const [title, setTitle] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [reveal, setReveal] = useState(0)
  const current = workspace.document

  const onPopState = useEffectEvent(() => {
    const id = new URLSearchParams(location.search).get("canvas")
    if (id && id !== current?.id) void workspace.select(id)
  })

  const onSearchShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && current) {
      event.preventDefault()
      setSearchOpen((open) => !open)
    }
  })

  useEffect(() => {
    window.addEventListener("popstate", onPopState)
    window.addEventListener("keydown", onSearchShortcut)
    return () => {
      window.removeEventListener("popstate", onPopState)
      window.removeEventListener("keydown", onSearchShortcut)
    }
  }, [])

  return (
    <div className="workspace">
      <header className="workspace-header">
        <div className="brand">
          <span aria-hidden="true">⌘</span> Wiki Explorations
        </div>
        <CanvasMenu
          workspace={workspace}
          onSelect={(id) => {
            setAction(undefined)
            void workspace.select(id).then(sync)
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
            disabled={!workspace.canUndo}
            onClick={workspace.undo}
          >
            <Undo2 size={16} aria-hidden="true" />
          </button>
          <button
            className="icon-only"
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
            aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z Control+Y"
            disabled={!workspace.canRedo}
            onClick={workspace.redo}
          >
            <Redo2 size={16} aria-hidden="true" />
          </button>
          <button disabled={workspace.loading || !current} onClick={() => setHistoryOpen(true)}>
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
      {workspace.error && (
        <div className="workspace-error" role="alert">
          {workspace.error}
          <button
            onClick={() => {
              void workspace.retry()
            }}
          >
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
            void workspace.create(title, action === "fork" ? current?.id : undefined).then(sync)
          }}
        >
          <label>
            {action === "fork" ? "Fork name" : "Canvas name"}
            <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <button className="primary" disabled={!title.trim() || workspace.loading}>
            {action === "fork" ? "Fork" : "Create"}
          </button>
          <button type="button" onClick={() => setAction(undefined)}>
            Cancel
          </button>
        </form>
      )}
      {current ? (
        <ReactFlowProvider key={current.id}>
          <div className="canvas-container" inert={workspace.loading}>
            <CanvasView
              canvas={current.canvas}
              onEdit={workspace.edit}
              view={view}
              navigate={navigate}
              reveal={reveal}
            />
          </div>
        </ReactFlowProvider>
      ) : (
        <div className="empty-workspace">
          {workspace.loading ? "Opening canvas…" : "Create a canvas to start exploring."}
        </div>
      )}
      {current && (
        <CommandPalette
          open={searchOpen}
          onOpenChange={setSearchOpen}
          nodes={current.canvas.nodes}
          onPick={(id) => {
            setSearchOpen(false)
            navigate({ mode: view.mode, node: id }, { push: true })
            setReveal((count) => count + 1)
          }}
        />
      )}
      {current && historyOpen && (
        <HistoryDialog
          key={current.id}
          id={current.id}
          canvas={current.canvas}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  )
}

const root = document.getElementById("root")
if (root) createRoot(root).render(<App />)
