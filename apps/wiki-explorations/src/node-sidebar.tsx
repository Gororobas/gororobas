import { Option, Schema } from "effect"
import { useRef, useState } from "react"
import Markdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"

import { ExampleDataTree, ExpandExampleData } from "./example-data-viewer.js"
import {
  ArchitectureConfidence,
  architectureConfidenceLabels,
  EventType,
  ExampleDataText,
  formatExampleData,
  type GraphNode,
} from "./graph.js"
import { kinds } from "./node-card.js"

const parseExampleData = Schema.decodeOption(ExampleDataText)

function EditorMode({
  label,
  preview,
  setPreview,
}: {
  label: string
  preview: boolean
  setPreview: (preview: boolean) => void
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
        Write
      </button>
      <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
        Preview
      </button>
    </div>
  )
}

function RadioTabs<Value extends string>({
  legend,
  options,
  labels,
  value,
  onChange,
}: {
  legend: string
  options: ReadonlyArray<Value>
  labels?: Record<Value, string>
  value: Value
  onChange: (value: Value) => void
}) {
  return (
    <fieldset className="radio-tabs">
      <legend>{legend}</legend>
      <div className="segmented">
        {options.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={legend}
              checked={option === value}
              onChange={() => onChange(option)}
            />
            {labels?.[option] ?? option}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function ExampleDataEditor({
  value,
  save,
}: {
  value: Schema.Json | undefined
  save: (value: Schema.Json | undefined) => void
}) {
  const saved = formatExampleData(value)
  const [draft, setDraft] = useState(saved)
  const [preview, setPreview] = useState(true)
  const parsed = draft.trim() === "" ? Option.some(undefined) : parseExampleData(draft)
  const invalid = Option.isNone(parsed)
  const example = Option.getOrUndefined(parsed)

  return (
    <section className="example-data">
      <div className="description-header">
        <label htmlFor="example-data">Example data (JSON)</label>
        <div className="field-actions">
          <EditorMode label="Example data mode" preview={preview} setPreview={setPreview} />
          <ExpandExampleData value={example} />
        </div>
      </div>
      {preview ? (
        example !== undefined && <ExampleDataTree value={example} />
      ) : (
        <textarea
          id="example-data"
          value={draft}
          placeholder="Enter JSON…"
          spellCheck={false}
          aria-invalid={invalid}
          aria-describedby={invalid ? "example-data-error" : undefined}
          onChange={(event) => setDraft(event.target.value)}
        />
      )}
      {preview && !invalid && example === undefined && (
        <div className="json-tree">No example data.</div>
      )}
      {invalid && <p id="example-data-error">Enter valid JSON or clear the field.</p>}
      {draft !== saved && (
        <div className="field-actions example-edit-actions">
          <button
            type="button"
            disabled={invalid}
            onClick={() => {
              if (Option.isSome(parsed)) {
                save(parsed.value)
                setDraft(formatExampleData(parsed.value))
                setPreview(true)
              }
            }}
          >
            Apply example
          </button>
          <button type="button" onClick={() => setDraft(saved)}>
            Cancel
          </button>
        </div>
      )}
    </section>
  )
}

export function NodeSidebar({
  node,
  edit,
  close,
  remove,
  openPipeline,
}: {
  node: GraphNode
  edit: (node: GraphNode, group?: symbol) => void
  close: () => void
  remove: () => void
  openPipeline?: (() => void) | undefined
}) {
  const [preview, setPreview] = useState(true)
  const editGroup = useRef<symbol>(undefined)
  const kind = kinds[node.kind]
  const example = node.kind === "transformation" ? "" : formatExampleData(node.exampleData)

  function startTextEdit() {
    editGroup.current = Symbol()
  }

  return (
    <aside className={`sidebar ${node.kind}`} aria-label="Node editor">
      <div className="sidebar-heading">
        <span className="node-glyph">{kind.glyph}</span>
        <h2>{kind.title}</h2>
        <button className="icon-button" aria-label="Close node editor" onClick={close}>
          ×
        </button>
      </div>
      {openPipeline && (
        <button className="open-pipeline" onClick={openPipeline}>
          Open pipeline
        </button>
      )}
      <label>
        Title
        <input
          value={node.title}
          onFocus={startTextEdit}
          onChange={(event) => edit({ ...node, title: event.target.value }, editGroup.current)}
        />
      </label>
      <RadioTabs
        legend="Architecture confidence"
        options={ArchitectureConfidence.literals}
        labels={architectureConfidenceLabels}
        value={node.architectureConfidence}
        onChange={(architectureConfidence) => edit({ ...node, architectureConfidence })}
      />
      {node.kind === "event" && (
        <>
          <RadioTabs
            legend="Event type"
            options={EventType.literals}
            value={node.eventType}
            onChange={(eventType) => {
              if (eventType === node.eventType) return

              const {
                id,
                title,
                description,
                architectureConfidence,
                position,
                kind,
                exampleData,
              } = node

              const fields = {
                id,
                title,
                description,
                architectureConfidence,
                position,
                kind,
                exampleData,
              }

              edit(
                eventType === "Claim"
                  ? { ...fields, eventType, isEvaluationRequired: false }
                  : { ...fields, eventType },
              )
            }}
          />
          {node.eventType === "Claim" && (
            <label className="evaluation-switch">
              Needs evaluation
              <input
                type="checkbox"
                role="switch"
                checked={node.isEvaluationRequired}
                onChange={(event) => edit({ ...node, isEvaluationRequired: event.target.checked })}
              />
            </label>
          )}
        </>
      )}
      <div className="description-header">
        <label htmlFor="description">Description</label>
        <EditorMode label="Markdown mode" preview={preview} setPreview={setPreview} />
      </div>
      {preview ? (
        <div className="markdown-preview">
          <Markdown rehypePlugins={[rehypeHighlight]}>{node.description}</Markdown>
        </div>
      ) : (
        <textarea
          id="description"
          value={node.description}
          placeholder="Write in Markdown…"
          onFocus={startTextEdit}
          onChange={(event) =>
            edit({ ...node, description: event.target.value }, editGroup.current)
          }
        />
      )}
      {node.kind !== "transformation" && (
        <ExampleDataEditor
          key={example}
          value={node.exampleData}
          save={(exampleData) => edit({ ...node, exampleData })}
        />
      )}
      <button className="delete-button" onClick={remove}>
        Delete node
      </button>
    </aside>
  )
}
