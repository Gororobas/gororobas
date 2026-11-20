import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"

import type { GraphNode } from "./graph.js"

export const kinds = {
  event: { title: "Event", glyph: "ϟ", color: "#ffedd8" },
  transformation: { title: "Transformation", glyph: "ƒ", color: "#e9edff" },
  property: { title: "Property", glyph: "▤", color: "#e2f2e9" },
}

/** Connections a pipeline view leaves out, counted so the card can say so. */
type Hidden = { inputs: number; outputs: number }

export type FlowNode = Node<GraphNode & { focused?: boolean; hidden?: Hidden }, "graph">
export const width = 228
export const height = 86

function NodeCard({ data, selected }: NodeProps<FlowNode>) {
  const kind = kinds[data.kind]

  return (
    <div
      className={`node-card ${data.kind} ${selected ? "selected" : ""} ${data.focused ? "focused" : ""}`}
    >
      {data.kind !== "event" && <Handle type="target" position={Position.Left} id="input" />}
      <div className="node-kind">
        <span className="node-glyph">{kind.glyph}</span>
        {kind.title}
        {data.kind === "event" && <span className="event-type">{data.eventType}</span>}
      </div>
      <strong title={data.title}>{data.title.trim() || "Untitled"}</strong>
      <span className="node-description">{data.description.trim().replace(/\s+/g, " ")}</span>
      <Handle type="source" position={Position.Right} id="output" />
      {!!data.hidden?.inputs && (
        <span className="hidden-count inputs">+{data.hidden.inputs} in</span>
      )}
      {!!data.hidden?.outputs && (
        <span className="hidden-count outputs">+{data.hidden.outputs} out</span>
      )}
    </div>
  )
}

export const nodeTypes = { graph: NodeCard }
