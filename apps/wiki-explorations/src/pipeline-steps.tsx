import { Array as EffectArray } from "effect"
import Markdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"

import { ExampleSchemaPreview, ExpandExampleSchema } from "./example-schema.js"
import type { GraphNode } from "./graph.js"
import { kinds } from "./node-card.js"
import { upstreamTree, type Pipeline, type UpstreamBranch } from "./pipeline.js"

function NodeText({ node }: { node: GraphNode }) {
  return (
    <div className="markdown-preview borderless">
      <Markdown rehypePlugins={[rehypeHighlight]}>{node.description}</Markdown>
      {node.openQuestions !== undefined && (
        <aside className="open-questions" aria-label="Open questions">
          <h3>Open questions</h3>
          <Markdown rehypePlugins={[rehypeHighlight]}>{node.openQuestions}</Markdown>
        </aside>
      )}
    </div>
  )
}

type Navigate = { onFocus: (id: string) => void; onSelect: (id: string) => void }

function NodeChip({
  node,
  note,
  muted,
  onFocus,
}: {
  node: GraphNode
  note?: string | undefined
  muted?: boolean | undefined
  onFocus: (id: string) => void
}) {
  return (
    <button
      className={`chip ${node.kind} ${muted ? "muted" : ""}`}
      title={`Open the ${node.title || "untitled"} pipeline`}
      onClick={() => onFocus(node.id)}
    >
      <span className="node-glyph">{kinds[node.kind].glyph}</span>
      {node.title.trim() || "Untitled"}
      {note && <span className="chip-note">· {note}</span>}
    </button>
  )
}

function TreeRow({
  branch,
  pipeline,
  onFocus,
}: {
  branch: UpstreamBranch
  pipeline: Pipeline
  onFocus: (id: string) => void
}) {
  const { node, repeated, inputs } = branch
  const readers = pipeline.outputs.get(node.id)?.length ?? 0

  const row = (
    <span className={`tree-row ${node.kind} ${node.id === pipeline.focus?.id ? "focused" : ""}`}>
      <span className="node-glyph">{kinds[node.kind].glyph}</span>
      <button className="tree-title" onClick={() => onFocus(node.id)}>
        {node.title.trim() || "Untitled"}
      </button>
      {readers > 1 && node.kind !== "event" && <span className="tree-tag">{readers} readers</span>}
      <span className="tree-meta">
        {repeated ? "↺ shown above" : node.kind === "event" ? node.eventType : ""}
      </span>
    </span>
  )

  if (!inputs.length) return <li className="tree-leaf">{row}</li>

  return (
    <li>
      <details open>
        <summary>{row}</summary>
        <ul>
          {inputs.map((input) => (
            <TreeRow key={input.node.id} branch={input} pipeline={pipeline} onFocus={onFocus} />
          ))}
        </ul>
      </details>
    </li>
  )
}

/** The upstream tree beside a document that reads the pipeline as numbered steps. */
export function PipelineSteps({ pipeline, onFocus, onSelect }: { pipeline: Pipeline } & Navigate) {
  const { focus, byId, inputs, outputs, upstream, downstream, steps, sourceEvents } = pipeline
  const tree = upstreamTree(pipeline)
  if (!focus || !tree) return null

  const nodesOf = (ids: readonly string[] = []) => ids.flatMap((id) => byId.get(id) ?? [])
  const stepNumber = new Map(steps.map(({ id }, index) => [id, index + 1]))
  const producedAt = (node: GraphNode) =>
    (inputs.get(node.id) ?? []).map((id) => stepNumber.get(id)).find((step) => step !== undefined)
  const onPipeline = (id: string) => id === focus.id || upstream.has(id)
  const feeds = nodesOf([...downstream].filter(([, hops]) => hops === 1).map(([id]) => id))

  return (
    <div className="pipeline-steps">
      <nav className="upstream-tree" aria-label="Upstream">
        <h2>Upstream</h2>
        <ul>
          <TreeRow branch={tree} pipeline={pipeline} onFocus={onFocus} />
        </ul>
      </nav>
      {/* Keyed so refocusing scrolls back to the top. */}
      <article key={focus.id} className="pipeline-document">
        <header className={focus.kind}>
          <div className="node-kind">
            <span className="node-glyph">{kinds[focus.kind].glyph}</span>
            {kinds[focus.kind].title}
            {focus.kind === "event" && <span className="event-type">{focus.eventType}</span>}
          </div>
          <h1>{focus.title.trim() || "Untitled"}</h1>
          <button onClick={() => onSelect(focus.id)}>Edit</button>
        </header>
        <NodeText node={focus} />
        {focus.kind !== "transformation" && focus.exampleSchema !== undefined && (
          <details className="markdown-preview borderless example-schema">
            <summary>Example schema</summary>
            <ExpandExampleSchema>
              <ExampleSchemaPreview value={focus.exampleSchema} />
            </ExpandExampleSchema>
            <ExampleSchemaPreview value={focus.exampleSchema} />
          </details>
        )}

        {EffectArray.isReadonlyArrayNonEmpty(sourceEvents) && (
          <section>
            <h2>Source events</h2>
            <div className="chips">
              {sourceEvents.map((event) => (
                <NodeChip
                  key={event.id}
                  node={event}
                  note={event.kind === "event" ? event.eventType : undefined}
                  onFocus={onFocus}
                />
              ))}
            </div>
          </section>
        )}

        {EffectArray.isReadonlyArrayNonEmpty(steps) && (
          <section>
            <h2>Steps · {steps.length}</h2>
            <ol className="steps">
              {steps.map((step, index) => (
                <li key={step.id} className={step.id === focus.id ? "focused" : ""}>
                  <span className="step-number">{index + 1}</span>
                  <div className="step-body">
                    <div className="step-heading">
                      <button className="step-title" onClick={() => onFocus(step.id)}>
                        {step.title.trim() || "Untitled"}
                      </button>
                      <button onClick={() => onSelect(step.id)}>Edit</button>
                    </div>
                    <NodeText node={step} />
                    <div className="chips">
                      <span className="chips-label">In</span>
                      {nodesOf(inputs.get(step.id)).map((input) => {
                        const from = producedAt(input)

                        return (
                          <NodeChip
                            key={input.id}
                            node={input}
                            note={from === undefined ? undefined : `step ${from}`}
                            onFocus={onFocus}
                          />
                        )
                      })}
                    </div>
                    <div className="chips">
                      <span className="chips-label">Out</span>
                      {nodesOf(outputs.get(step.id)).map((output) => (
                        <NodeChip
                          key={output.id}
                          node={output}
                          muted={!onPipeline(output.id)}
                          onFocus={onFocus}
                        />
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {EffectArray.isReadonlyArrayNonEmpty(feeds) && (
          <section>
            <h2>Downstream</h2>
            <ul className="feeds">
              {feeds.map((node) => (
                <li key={node.id}>
                  <NodeChip node={node} onFocus={onFocus} />
                  {EffectArray.isReadonlyArrayNonEmpty(nodesOf(outputs.get(node.id))) && (
                    <span className="arrow">→</span>
                  )}
                  {nodesOf(outputs.get(node.id)).map((next) => (
                    <NodeChip key={next.id} node={next} onFocus={onFocus} />
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  )
}
