import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  CircleDashed,
  CircleHelp,
  Flag,
  Globe,
  Lock,
  MessageSquareQuote,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import { useRef, useState } from "react"
import Markdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"

import { ExampleSchemaEditor } from "./example-schema.js"
import {
  ArchitectureConfidence,
  architectureConfidenceLabels,
  EventType,
  type GraphNode,
  isMissingOpenQuestions,
  lockContent,
  lockIntegrity,
  lockWarnings,
  withLockFingerprint,
} from "./graph.js"
import { kinds } from "./node-card.js"
import { historyDialogAtom, nodeStatusesAtom } from "./workspace.js"

const architectureConfidenceIcons = {
  NOT_REVIEWED: CircleDashed,
  LOCKED_IN: Lock,
  UNCERTAIN: CircleHelp,
} satisfies Record<typeof ArchitectureConfidence.Type, LucideIcon>

const eventTypeIcons = {
  Claim: MessageSquareQuote,
  "External data": Globe,
  Report: Flag,
} satisfies Record<typeof EventType.Type, LucideIcon>

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

function MarkdownField({
  id,
  label,
  value,
  placeholder,
  error,
  onFocus,
  onChange,
}: {
  id: string
  label: string
  value: string
  placeholder: string
  error?: string | undefined
  onFocus: () => void
  onChange: (value: string) => void
}) {
  const [preview, setPreview] = useState(value.trim() !== "")

  return (
    <>
      <div className="description-header">
        <label htmlFor={id}>{label}</label>
        <EditorMode label={`${label} Markdown mode`} preview={preview} setPreview={setPreview} />
      </div>
      {preview ? (
        <div className="markdown-preview">
          <Markdown rehypePlugins={[rehypeHighlight]}>{value}</Markdown>
        </div>
      ) : (
        <textarea
          id={id}
          value={value}
          placeholder={placeholder}
          aria-invalid={error !== undefined}
          aria-describedby={error === undefined ? undefined : `${id}-error`}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error !== undefined && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </>
  )
}

function RadioTabs<Value extends string>({
  legend,
  options,
  labels,
  icons,
  value,
  onChange,
}: {
  legend: string
  options: ReadonlyArray<Value>
  labels?: Record<Value, string>
  icons: Record<Value, LucideIcon>
  value: Value
  onChange: (value: Value) => void
}) {
  return (
    <fieldset className="radio-tabs">
      <legend>{legend}</legend>
      <div className="segmented">
        {options.map((option) => {
          const Icon: LucideIcon = icons[option]

          return (
            <label key={option}>
              <input
                type="radio"
                name={legend}
                checked={option === value}
                onChange={() => onChange(option)}
              />
              <Icon size={14} aria-hidden="true" />
              {labels?.[option] ?? option}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function NodeSidebar({
  node,
  edit: saveNode,
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
  const editGroup = useRef<symbol>(undefined)
  const kind = kinds[node.kind]

  const integrity = lockIntegrity(node)
  const change = useAtomValue(nodeStatusesAtom).get(node.id)
  const openHistory = useAtomSet(historyDialogAtom)

  function edit(next: GraphNode, group?: symbol) {
    saveNode(withLockFingerprint(node, next), group)
  }

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
      {change && (
        <button className="node-change" onClick={() => openHistory({ focusedNode: node.id })}>
          <span className="diff-status" data-status={change}>
            {change}
          </span>
          since last commit · View changes
        </button>
      )}
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
        icons={architectureConfidenceIcons}
        value={node.architectureConfidence}
        onChange={(architectureConfidence) => edit({ ...node, architectureConfidence })}
      />
      {(integrity === "CHANGED" || integrity === "UNVERIFIED") && (
        <div className="lock-warning" role="alert">
          <TriangleAlert size={16} aria-hidden />
          <p>{lockWarnings[integrity]}</p>
          <button onClick={() => saveNode(lockContent(node))}>Accept changes</button>
        </div>
      )}
      {node.kind === "event" && (
        <>
          <RadioTabs
            legend="Event type"
            options={EventType.literals}
            icons={eventTypeIcons}
            value={node.eventType}
            onChange={(eventType) => {
              if (eventType === node.eventType) return

              const {
                id,
                title,
                description,
                architectureConfidence,
                position,
                openQuestions,
                lockedContentHash,
                kind,
                exampleSchema,
              } = node

              const fields = {
                id,
                title,
                description,
                architectureConfidence,
                position,
                openQuestions,
                lockedContentHash,
                kind,
                exampleSchema,
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
      <MarkdownField
        key={`${node.id}:description`}
        id="description"
        label="Description"
        value={node.description}
        placeholder="Write in Markdown…"
        onFocus={startTextEdit}
        onChange={(description) => edit({ ...node, description }, editGroup.current)}
      />
      {(node.architectureConfidence === "UNCERTAIN" || node.openQuestions !== undefined) && (
        <MarkdownField
          key={`${node.id}:open-questions`}
          id="open-questions"
          label="Open questions"
          value={node.openQuestions ?? ""}
          placeholder="What's still undecided, in Markdown…"
          error={isMissingOpenQuestions(node) ? "Required while uncertain." : undefined}
          onFocus={startTextEdit}
          onChange={(openQuestions) =>
            edit(
              {
                ...node,
                openQuestions: openQuestions === "" ? undefined : openQuestions,
              },
              editGroup.current,
            )
          }
        />
      )}
      {node.kind !== "transformation" && (
        <ExampleSchemaEditor
          key={JSON.stringify([node.id, node.exampleSchema])}
          value={node.exampleSchema}
          save={(exampleSchema) => edit({ ...node, exampleSchema })}
        />
      )}
      <button className="delete-button" onClick={remove}>
        Delete node
      </button>
    </aside>
  )
}
