import { useMemo, useState } from "react"

import { withoutNodes, type Canvas } from "./graph.js"
import { kinds } from "./node-card.js"
import { NodeSidebar } from "./node-sidebar.js"
import { PipelineGraph, type Depth } from "./pipeline-graph.js"
import { PipelineSteps } from "./pipeline-steps.js"
import { pipelineAround } from "./pipeline.js"

export type PipelineMode = "graph" | "steps"

const depthOptions = [1, 2, 3, Infinity]

function DepthPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="depth-picker">
      {label}
      <div className="segmented" aria-label={`${label} depth`}>
        {depthOptions.map((option) => (
          <button key={option} aria-pressed={value === option} onClick={() => onChange(option)}>
            {option === Infinity ? "All" : option}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Everything upstream and downstream of one node, as a graph or as readable steps. */
export function PipelineView({
  canvas,
  focusId,
  mode,
  onEdit,
  onFocus,
  onMode,
  onClose,
  selected,
  onSelect: setSelected,
}: {
  canvas: Canvas
  focusId: string
  mode: PipelineMode
  onEdit: (next: Canvas, group?: symbol) => void
  onFocus: (id: string) => void
  onMode: (mode: PipelineMode) => void
  onClose: () => void
  selected: string | undefined
  onSelect: (id: string | undefined) => void
}) {
  const [depth, setDepth] = useState<Depth>({ upstream: Infinity, downstream: Infinity })
  const pipeline = useMemo(() => pipelineAround(canvas, focusId), [canvas, focusId])
  const { focus, upstream, downstream } = pipeline
  const selectedNode = canvas.nodes.find(({ id }) => id === selected)
  if (!focus) return null

  return (
    <div className="pipeline-view">
      <div className="pipeline-bar">
        <button onClick={onClose}>← Canvas</button>
        <div className={`pipeline-heading ${focus.kind}`}>
          <span className="node-glyph">{kinds[focus.kind].glyph}</span>
          <strong>{focus.title.trim() || "Untitled"}</strong>
          <span className="pipeline-size">
            {upstream.size} upstream · {downstream.size} downstream
          </span>
        </div>
        <div className="segmented" aria-label="Pipeline view">
          <button aria-pressed={mode === "graph"} onClick={() => onMode("graph")}>
            Graph
          </button>
          <button aria-pressed={mode === "steps"} onClick={() => onMode("steps")}>
            Steps
          </button>
        </div>
        {mode === "graph" && (
          <div className="pipeline-depths">
            <DepthPicker
              label="Upstream"
              value={depth.upstream}
              onChange={(upstream) => setDepth({ ...depth, upstream })}
            />
            <DepthPicker
              label="Downstream"
              value={depth.downstream}
              onChange={(downstream) => setDepth({ ...depth, downstream })}
            />
          </div>
        )}
      </div>
      <div className="pipeline-body">
        {mode === "graph" ? (
          <PipelineGraph
            canvas={canvas}
            pipeline={pipeline}
            depth={depth}
            selected={selected}
            onSelect={setSelected}
            onFocus={onFocus}
          />
        ) : (
          <PipelineSteps pipeline={pipeline} onFocus={onFocus} onSelect={setSelected} />
        )}
        {selectedNode && (
          <NodeSidebar
            key={selectedNode.id}
            node={selectedNode}
            edit={(node, group) =>
              onEdit(
                {
                  ...canvas,
                  nodes: canvas.nodes.map((existing) =>
                    existing.id === node.id ? node : existing,
                  ),
                },
                group,
              )
            }
            close={() => setSelected(undefined)}
            remove={() => {
              setSelected(undefined)
              onEdit(withoutNodes(canvas, new Set([selectedNode.id])))
            }}
            openPipeline={selectedNode.id === focus.id ? undefined : () => onFocus(selectedNode.id)}
          />
        )}
      </div>
    </div>
  )
}
