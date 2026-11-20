import dagre from "@dagrejs/dagre"

import type { GraphEdge } from "./graph.js"
import { height, width } from "./node-card.js"

/** Left-to-right top-left positions for node cards, keyed by node ID. */
export function layoutPositions(ids: readonly string[], edges: readonly GraphEdge[]) {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 102 })
  for (const id of ids) graph.setNode(id, { width, height })
  for (const { source, target } of edges) graph.setEdge(source, target)
  dagre.layout(graph)

  return new Map(
    ids.map((id) => {
      const { x, y } = graph.node(id)
      return [id, { x: x - width / 2, y: y - height / 2 }]
    }),
  )
}
