import { Dialog } from "@base-ui/react/dialog"
import { useAtomValue } from "@effect/atom-react"
import { Array as EffectArray, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useLayoutEffect, useRef, useState } from "react"

import type { CanvasHistoryComparison } from "./canvas-api.js"
import { diffCanvas, diffWords, type WordChange } from "./canvas-diff.js"
import type { Canvas } from "./graph.js"
import { canvasHistoryAtom } from "./workspace.js"

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

function Comparison({
  result,
  canvas,
  focusedNode,
  onShowNode,
}: {
  result: CanvasHistoryComparison
  canvas: Canvas
  focusedNode: string | undefined
  onShowNode: (id: string) => void
}) {
  const { metadata, nodes, connections, moved } = diffCanvas(result.baseline, canvas)
  const shortCommit = result.commit.slice(0, 8)
  const focused = useRef<HTMLDetailsElement>(null)

  useLayoutEffect(() => {
    focused.current?.scrollIntoView({ block: "start" })
  }, [result.commit])

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
            <details
              key={id}
              ref={id === focusedNode ? focused : undefined}
              open={id === focusedNode || undefined}
              data-focused={id === focusedNode || undefined}
            >
              <summary>
                <span className="diff-status" data-status={status}>
                  {status}
                </span>{" "}
                {title}
                {status !== "Removed" && (
                  <button
                    type="button"
                    className="show-node"
                    onClick={(event) => {
                      event.preventDefault()
                      onShowNode(id)
                    }}
                  >
                    Show on canvas
                  </button>
                )}
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

function History({
  id,
  canvas,
  focusedNode,
  onShowNode,
}: {
  id: string
  canvas: Canvas
  focusedNode: string | undefined
  onShowNode: (id: string) => void
}) {
  const [ref, setRef] = useState("HEAD")
  const [compared, setCompared] = useState("HEAD")
  const comparison = useAtomValue(canvasHistoryAtom(id)(compared))
  const result = Option.getOrUndefined(AsyncResult.value(comparison))
  const loading = comparison.waiting || AsyncResult.isInitial(comparison)
  const error = Option.getOrUndefined(AsyncResult.error(comparison))?.message

  return (
    <>
      <div className="history-heading">
        <div>
          <Dialog.Title>Canvas history</Dialog.Title>
          <Dialog.Description>{canvas.title}</Dialog.Description>
        </div>
        <Dialog.Close>Close</Dialog.Close>
      </div>
      <form
        className="history-compare"
        onSubmit={(event) => {
          event.preventDefault()
          if (!loading && ref.trim()) setCompared(ref.trim())
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
                  setCompared(hash)
                }}
              >
                <span>{subject || "(No subject)"}</span>
                <small>
                  <code>{hash.slice(0, 8)}</code> · {date}
                </small>
              </button>
            ))}
          </section>
          <Comparison
            result={result}
            canvas={canvas}
            focusedNode={focusedNode}
            onShowNode={onShowNode}
          />
        </div>
      )}
    </>
  )
}

/** Compares the canvas with a Git ref; `focusedNode` opens and scrolls to that node's changes. */
export function HistoryDialog({
  open,
  onOpenChange,
  ...history
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  id: string
  canvas: Canvas
  focusedNode: string | undefined
  onShowNode: (id: string) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="history-dialog nokey">
          <History {...history} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
