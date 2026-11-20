import { ReactFlowProvider } from "@xyflow/react"
import { useState } from "react"
import { createRoot } from "react-dom/client"
import "@xyflow/react/dist/style.css"
import "highlight.js/styles/github.css"

import "./styles.css"
import { CanvasEditor } from "./canvas-editor.js"
import type { Canvas } from "./graph.js"
import { HistoryDialog } from "./history-dialog.js"
import { PipelineView, type PipelineMode } from "./pipeline-view.js"
import { useWorkspace } from "./workspace.js"

function CanvasView({
  canvas,
  onEdit,
}: {
  canvas: Canvas
  onEdit: (next: Canvas, group?: symbol) => void
}) {
  const [focusId, setFocusId] = useState<string>()
  const [mode, setMode] = useState<PipelineMode>("graph")

  // Undo or a delete can remove the focused node; fall back to the whole canvas.
  return focusId && canvas.nodes.some(({ id }) => id === focusId) ? (
    <PipelineView
      canvas={canvas}
      focusId={focusId}
      mode={mode}
      onEdit={onEdit}
      onFocus={setFocusId}
      onMode={setMode}
      onClose={() => setFocusId(undefined)}
    />
  ) : (
    <CanvasEditor canvas={canvas} onEdit={onEdit} onOpenPipeline={setFocusId} />
  )
}

function App() {
  const workspace = useWorkspace()
  const [action, setAction] = useState<"new" | "fork">()
  const [title, setTitle] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const current = workspace.document

  return (
    <div className="workspace">
      <header className="workspace-header">
        <div className="brand">
          <span aria-hidden="true">⌘</span> Wiki Explorations
        </div>
        <select
          aria-label="Canvas"
          className="canvas-select"
          value={current?.id ?? ""}
          disabled={workspace.loading}
          onChange={(event) => {
            setAction(undefined)
            void workspace.select(event.target.value)
          }}
        >
          {!current && <option value="">Select a canvas</option>}
          {workspace.entries.map(({ id, title }) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
        {current?.canvas.forkedFrom && (
          <span className="fork-label">Fork of {current.canvas.forkedFrom}</span>
        )}
        <div className="workspace-history">
          <button
            aria-keyshortcuts="Meta+Z Control+Z"
            disabled={!workspace.canUndo}
            onClick={workspace.undo}
          >
            Undo
          </button>
          <button
            aria-keyshortcuts="Meta+Shift+Z Control+Shift+Z Control+Y"
            disabled={!workspace.canRedo}
            onClick={workspace.redo}
          >
            Redo
          </button>
          <button disabled={workspace.loading || !current} onClick={() => setHistoryOpen(true)}>
            Git history
          </button>
        </div>
        <div className="workspace-actions">
          <button
            disabled={workspace.loading || !current}
            onClick={() => {
              setTitle(`${current?.canvas.title ?? ""} fork`)
              setAction("fork")
            }}
          >
            Fork canvas
          </button>
          <button
            disabled={workspace.loading}
            onClick={() => {
              setTitle("")
              setAction("new")
            }}
          >
            New canvas
          </button>
        </div>
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
            void workspace.create(title, action === "fork" ? current?.id : undefined)
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
            <CanvasView canvas={current.canvas} onEdit={workspace.edit} />
          </div>
        </ReactFlowProvider>
      ) : (
        <div className="empty-workspace">
          {workspace.loading ? "Opening canvas…" : "Create a canvas to start exploring."}
        </div>
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
