import { Array as EffectArray } from "effect"
import { useEffect, useRef, useState } from "react"

import { diffCanvas, diffWords, type WordChange } from "./canvas-diff.js"
import type { CanvasHistoryComparison } from "./git-history.js"
import type { Canvas } from "./graph.js"
import { loadCanvasHistory } from "./workspace.js"

function HighlightedText({ changes, side }: { changes: WordChange[]; side: "removed" | "added" }) {
  const parts = changes.filter(({ status }) => status === "same" || status === side)
  if (!parts.some(({ text }) => text.trim())) return <span>—</span>
  const Change = side === "removed" ? "del" : "ins"

  return (
    <span>
      {parts.map(({ text, status }, index) =>
        status === "same" ? text : <Change key={index}>{text}</Change>,
      )}
    </span>
  )
}

function FieldChanges({
  fields,
}: {
  fields: { id?: string; label: string; before: string; after: string }[]
}) {
  return (
    <dl className="diff-fields">
      {fields.map(({ id, label, before, after }) => {
        const changes = diffWords(before, after)

        return (
          <div key={id ?? label}>
            <dt>{label}</dt>
            <dd>
              <div className="diff-before">
                <strong>Before</strong>
                <HighlightedText changes={changes} side="removed" />
              </div>
              <div className="diff-after">
                <strong>Now</strong>
                <HighlightedText changes={changes} side="added" />
              </div>
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

function Comparison({ result, canvas }: { result: CanvasHistoryComparison; canvas: Canvas }) {
  const { metadata, nodes, connections, moved } = diffCanvas(result.baseline, canvas)
  const shortCommit = result.commit.slice(0, 8)

  return (
    <section className="diff-results" aria-label="Canvas changes">
      <h3>
        Changes from{" "}
        <code title={result.commit}>
          {result.commit.startsWith(result.ref) ? shortCommit : result.ref + " · " + shortCommit}
        </code>
      </h3>
      {!result.baseline && <p>This canvas was added after the selected commit.</p>}
      {metadata.length + nodes.length + connections.length + moved.length === 0 && (
        <p>No changes.</p>
      )}
      {EffectArray.isReadonlyArrayNonEmpty(metadata) && <FieldChanges fields={metadata} />}
      {EffectArray.isReadonlyArrayNonEmpty(nodes) && (
        <section>
          <h4>Nodes ({nodes.length})</h4>
          {nodes.map(({ id, title, status, fields }) => (
            <details key={id}>
              <summary>
                <span className="diff-status" data-status={status}>
                  {status}
                </span>{" "}
                {title}
              </summary>
              <FieldChanges fields={fields} />
            </details>
          ))}
        </section>
      )}
      {EffectArray.isReadonlyArrayNonEmpty(connections) && (
        <section>
          <h4>Connections ({connections.length})</h4>
          <ul>
            {connections.map(({ id, status, source, target }) => (
              <li key={id}>
                <span className="diff-status" data-status={status}>
                  {status}
                </span>{" "}
                {source} → {target}
              </li>
            ))}
          </ul>
        </section>
      )}
      {EffectArray.isReadonlyArrayNonEmpty(moved) && (
        <details className="diff-layout">
          <summary>Layout changes ({moved.length} moved)</summary>
          <FieldChanges fields={moved} />
        </details>
      )}
    </section>
  )
}

export function HistoryDialog({
  id,
  canvas,
  onClose,
}: {
  id: string
  canvas: Canvas
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [ref, setRef] = useState("HEAD")
  const [result, setResult] = useState<CanvasHistoryComparison>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function compare(ref: string) {
    setError("")
    setLoading(true)

    try {
      setResult(await loadCanvasHistory(id, ref))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load canvas history.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    dialog.current?.showModal()
    void compare("HEAD")
  }, [id])

  return (
    <dialog
      ref={dialog}
      className="history-dialog"
      aria-labelledby="history-title"
      onClose={onClose}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="history-heading">
        <div>
          <h2 id="history-title">Canvas history</h2>
          <p>{canvas.title}</p>
        </div>
        <form method="dialog">
          <button>Close</button>
        </form>
      </div>
      <form
        className="history-compare"
        onSubmit={(event) => {
          event.preventDefault()
          if (!loading && ref.trim()) void compare(ref.trim())
        }}
      >
        <label>
          Compare with Git ref
          <input value={ref} onChange={(event) => setRef(event.target.value)} maxLength={200} />
        </label>
        <button className="primary" disabled={loading || !ref.trim()}>
          Compare
        </button>
      </form>
      {loading && <p role="status">Reading Git history…</p>}
      {error && (
        <p className="history-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="history-columns">
          <section className="history-commits">
            <h3>Recent commits on HEAD</h3>
            {EffectArray.isReadonlyArrayEmpty(result.commits) && (
              <p>No commits for this canvas on HEAD.</p>
            )}
            {result.commits.map(({ hash, date, subject }) => (
              <button
                key={hash}
                title={hash}
                type="button"
                aria-pressed={result.commit === hash}
                disabled={loading}
                onClick={() => {
                  setRef(hash)
                  void compare(hash)
                }}
              >
                <span>{subject || "(No subject)"}</span>
                <small>
                  <code>{hash.slice(0, 8)}</code> · {date}
                </small>
              </button>
            ))}
          </section>
          <Comparison result={result} canvas={canvas} />
        </div>
      )}
    </dialog>
  )
}
