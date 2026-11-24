import { Array as EffectArray, HashMap, HashSet, Option, Record } from "effect"

import {
  architectureConfidenceLabels,
  edgeId,
  formatExampleData,
  type Canvas,
  type GraphNode,
} from "./graph.js"

const nodeFields = (node?: GraphNode) => ({
  Title: node?.title ?? "",
  Kind: node?.kind ?? "",
  "Architecture confidence": node ? architectureConfidenceLabels[node.architectureConfidence] : "",
  Event: node?.kind === "event" ? node.eventType : "",
  "Needs evaluation":
    node?.kind === "event" && node.eventType === "Claim"
      ? node.isEvaluationRequired
        ? "Yes"
        : "No"
      : "",
  Description: node?.description ?? "",
  "Example data": node && node.kind !== "transformation" ? formatExampleData(node.exampleData) : "",
})

const position = ({ position }: GraphNode) => `(${position.x}, ${position.y})`

const changedFields = (before: Record<string, string>, after: Record<string, string>) =>
  Record.toEntries(before).flatMap(([label, value]) => {
    const next = after[label] ?? ""
    return value === next ? [] : [{ label, before: value, after: next }]
  })

export function diffCanvas(baseline: Canvas | null, current: Canvas) {
  const previousNodes = baseline?.nodes ?? []
  const beforeNodes = HashMap.fromIterable(previousNodes.map((node) => [node.id, node]))
  const afterNodes = HashMap.fromIterable(current.nodes.map((node) => [node.id, node]))
  const nodeIds = EffectArray.dedupe([...current.nodes, ...previousNodes].map(({ id }) => id))

  const nodes = nodeIds.flatMap((id) => {
    const before = Option.getOrUndefined(HashMap.get(beforeNodes, id))
    const after = Option.getOrUndefined(HashMap.get(afterNodes, id))
    const fields = changedFields(nodeFields(before), nodeFields(after))
    if (before && after && !fields.length) return []
    const status = !before ? "Added" : !after ? "Removed" : "Edited"
    return [{ id, title: after?.title || before?.title || id, status, fields }]
  })

  const moved = current.nodes.flatMap((node) => {
    const before = Option.getOrUndefined(HashMap.get(beforeNodes, node.id))
    if (!before || position(before) === position(node)) return []

    return [
      {
        id: node.id,
        label: node.title || node.id,
        before: position(before),
        after: position(node),
      },
    ]
  })

  const previousEdges = baseline?.edges ?? []
  const beforeEdgeIds = HashSet.fromIterable(previousEdges.map(edgeId))
  const afterEdgeIds = HashSet.fromIterable(current.edges.map(edgeId))

  const connections = [
    ...current.edges
      .filter((edge) => !HashSet.has(beforeEdgeIds, edgeId(edge)))
      .map((edge) => ({ edge, status: "Added", nodes: afterNodes })),
    ...previousEdges
      .filter((edge) => !HashSet.has(afterEdgeIds, edgeId(edge)))
      .map((edge) => ({ edge, status: "Removed", nodes: beforeNodes })),
  ].map(({ edge, status, nodes }) => ({
    id: edgeId(edge),
    status,
    source: Option.getOrUndefined(HashMap.get(nodes, edge.source))?.title || edge.source,
    target: Option.getOrUndefined(HashMap.get(nodes, edge.target))?.title || edge.target,
  }))

  const metadata = changedFields(
    { Title: baseline?.title ?? "", "Fork of": baseline?.forkedFrom ?? "" },
    { Title: current.title, "Fork of": current.forkedFrom ?? "" },
  )
  return { metadata, nodes, connections, moved }
}
