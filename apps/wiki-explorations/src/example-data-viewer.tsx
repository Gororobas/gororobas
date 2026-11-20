import { Array as EffectArray, Predicate, type Schema } from "effect"
import { useId, useRef } from "react"

import { formatExampleData } from "./graph.js"

function JsonNode({ name, value }: { name?: string | number | undefined; value: Schema.Json }) {
  const label =
    name === undefined ? null : (
      <>
        <span className="json-key">{formatExampleData(name)}</span>
        {": "}
      </>
    )

  if (!Predicate.isObjectKeyword(value)) {
    const type = Predicate.isString(value)
      ? "string"
      : Predicate.isNumber(value)
        ? "number"
        : "literal"

    return (
      <div>
        {label}
        <span className={`json-${type}`}>{formatExampleData(value)}</span>
      </div>
    )
  }

  const isArray = Array.isArray(value)
  const entries = Object.entries<Schema.Json>(value)
  const [start, end] = isArray ? ["[", "]"] : ["{", "}"]

  if (EffectArray.isReadonlyArrayEmpty(entries)) {
    return (
      <div>
        {label}
        {start}
        {end}
      </div>
    )
  }

  return (
    <details open={name === undefined}>
      <summary>
        {label}
        {start}
        <span className="json-collapsed">…{end}</span>
      </summary>
      <div className="json-children">
        {entries.map(([key, child]) => (
          <JsonNode key={key} name={isArray ? Number(key) : key} value={child} />
        ))}
      </div>
      <div>{end}</div>
    </details>
  )
}

export function ExampleDataTree({ value }: { value: Schema.Json }) {
  return (
    <div
      className="json-tree"
      onKeyDown={(event) => {
        if (event.key === " ") event.stopPropagation()
      }}
    >
      <JsonNode value={value} />
    </div>
  )
}

export function ExpandExampleData({ value }: { value: Schema.Json | undefined }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  return (
    <>
      <button
        type="button"
        className="expand-example"
        aria-label="Expand JSON"
        aria-haspopup="dialog"
        title="Expand JSON"
        disabled={value === undefined}
        onClick={() => dialog.current?.showModal()}
      >
        <span aria-hidden="true">⤢</span>
      </button>
      <dialog
        ref={dialog}
        className="example-dialog"
        aria-labelledby={titleId}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="history-heading">
          <h2 id={titleId}>Example data (JSON)</h2>
          <form method="dialog">
            <button>Close</button>
          </form>
        </div>
        {value !== undefined && <ExampleDataTree value={value} />}
      </dialog>
    </>
  )
}
