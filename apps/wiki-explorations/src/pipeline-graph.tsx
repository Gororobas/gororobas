import { Background, Controls, MarkerType, ReactFlow, type Edge } from "@xyflow/react"
import { useMemo } from "react"

import { edgeId, type Canvas } from "./graph.js"
import { layoutPositions } from "./layout.js"
import { height, nodeTypes, width, type FlowNode } from "./node-card.js"
import type { Pipeline } from "./pipeline.js"

export type Depth = { upstream: number; downstream: number }

/** The focus with its upstream and downstream nodes up to `depth` hops, laid out left to right. */
export function PipelineGraph({
  canvas,
  pipeline,
  depth,
  selected,
  onSelect,
  onFocus,
}: {
  canvas: Canvas
  pipeline: Pipeline
  depth: Depth
  selected: string | undefined
  onSelect: (id: string | undefined) => void
  onFocus: (id: string) => void
}) {
  const { focus, byId, inputs, outputs, upstream, downstream } = pipeline

  const { shown, shownEdges, positions } = useMemo(() => {
    const within = (distances: ReadonlyMap<string, number>, limit: number) =>
      [...distances].filter(([, hops]) => hops <= limit).map(([id]) => id)

    const shown = new Set([
      ...(focus ? [focus.id] : []),
      ...within(upstream, depth.upstream),
      ...within(downstream, depth.downstream),
    ])

    const shownEdges = canvas.edges.filter(
      ({ source, target }) => shown.has(source) && shown.has(target),
    )
    return { shown, shownEdges, positions: layoutPositions([...shown], shownEdges) }
  }, [canvas.edges, focus, upstream, downstream, depth])

  const nodes = [...shown].flatMap((id): FlowNode[] => {
    const node = byId.get(id)
    if (!node) return []
    const hidden = (ids: readonly string[] = []) => ids.filter((other) => !shown.has(other)).length

    return [
      {
        id,
        type: "graph",
        width,
        height,
        draggable: false,
        connectable: false,
        position: positions.get(id) ?? { x: 0, y: 0 },
        selected: id === selected,
        data: {
          ...node,
          focused: id === focus?.id,
          hidden: { inputs: hidden(inputs.get(id)), outputs: hidden(outputs.get(id)) },
        },
      },
    ]
  })

  const edges = shownEdges.map((edge): Edge => {
    const active = edge.source === selected || edge.target === selected
    const stroke = active ? "#202025" : "#a1a1aa"

    return {
      ...edge,
      id: edgeId(edge),
      type: "smoothstep",
      sourceHandle: "output",
      targetHandle: "input",
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
      style: { stroke, strokeWidth: active ? 2.7 : 1.5 },
    }
  })

  return (
    <div className="flow">
      <ReactFlow<FlowNode, Edge>
        // Re-fit whenever the set of visible nodes changes.
        key={[...shown].join()}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
        minZoom={0.1}
        maxZoom={3}
        nodesConnectable={false}
        deleteKeyCode={null}
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodeDoubleClick={(_, node) => onFocus(node.id)}
        onPaneClick={() => onSelect(undefined)}
      >
        <Background gap={22} size={1.2} color="#d6d6db" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
