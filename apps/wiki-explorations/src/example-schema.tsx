import highlighter from "highlight.js/lib/core"
import typescript from "highlight.js/lib/languages/typescript"
import { useId, useMemo, useRef, useState, type ReactNode } from "react"

highlighter.registerLanguage("typescript", typescript)

function HighlightedSchema({ value, hidden = false }: { value: string; hidden?: boolean }) {
  const code = useMemo(
    () => highlighter.highlight(value, { language: "typescript", ignoreIllegals: true }).value,
    [value],
  )

  return (
    <pre className="schema-code" aria-hidden={hidden || undefined}>
      <code dangerouslySetInnerHTML={{ __html: code }} />
      {hidden && "\n"}
    </pre>
  )
}

export function ExampleSchemaPreview({ value }: { value: string }) {
  return (
    <div className="schema-preview" tabIndex={0} aria-label="Example schema">
      <HighlightedSchema value={value} />
    </div>
  )
}

export function ExpandExampleSchema({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="expand-example"
        aria-label="Expand example schema"
        aria-haspopup="dialog"
        title="Expand example schema"
        onClick={() => {
          dialog.current?.showModal()
          setOpen(true)
        }}
      >
        <span aria-hidden="true">⤢</span>
      </button>
      <dialog
        ref={dialog}
        className="example-dialog"
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="history-heading">
          <h2 id={titleId}>Example schema</h2>
          <form method="dialog">
            <button>Close</button>
          </form>
        </div>
        {open && children}
      </dialog>
    </>
  )
}

function SchemaInput({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  const highlight = useRef<HTMLDivElement>(null)

  return (
    <div className="schema-input">
      <div className="schema-highlight" ref={highlight}>
        <HighlightedSchema value={value} hidden />
      </div>
      <textarea
        className="schema-code"
        id={id}
        aria-label="Example schema"
        value={value}
        placeholder="Schema.Struct({ … })"
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        wrap="off"
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          if (highlight.current) {
            highlight.current.scrollTop = event.currentTarget.scrollTop
            highlight.current.scrollLeft = event.currentTarget.scrollLeft
          }
        }}
      />
    </div>
  )
}

export function ExampleSchemaEditor({
  value,
  save,
}: {
  value: string | undefined
  save: (value: string | undefined) => void
}) {
  const id = useId()
  const saved = value ?? ""
  const [draft, setDraft] = useState(saved)

  const actions = draft !== saved && (
    <div className="field-actions example-edit-actions">
      <button type="button" onClick={() => save(draft.trim() === "" ? undefined : draft)}>
        Apply schema
      </button>
      <button type="button" onClick={() => setDraft(saved)}>
        Cancel
      </button>
    </div>
  )

  return (
    <section className="example-schema">
      <div className="description-header">
        <label htmlFor={id}>Example schema</label>
        <ExpandExampleSchema>
          <SchemaInput id={`${id}-expanded`} value={draft} onChange={setDraft} />
          {actions}
        </ExpandExampleSchema>
      </div>
      <SchemaInput id={id} value={draft} onChange={setDraft} />
      {actions}
    </section>
  )
}
