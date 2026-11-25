import { Array as EffectArray, HashMap, HashSet, Option, Record } from "effect"

import { architectureConfidenceLabels, edgeId, type Canvas, type GraphNode } from "./graph.js"

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
  "Open questions": node?.openQuestions ?? "",
  "Example schema": node && node.kind !== "transformation" ? (node.exampleSchema ?? "") : "",
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
    const status: "Added" | "Removed" | "Edited" = !before ? "Added" : !after ? "Removed" : "Edited"
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

export type WordChange = { text: string; status: "same" | "removed" | "added" }

/** Longest-common-subsequence diff over words, keeping whitespace attached so segments rejoin exactly. */
export function diffWords(before: string, after: string): WordChange[] {
  const a = before.match(/\s*\S+\s*|\s+/g) ?? []
  const b = after.match(/\s*\S+\s*|\s+/g) ?? []
  const word = (tokens: string[], index: number) => tokens[index]?.trim()
  const indexesFromEnd = (tokens: string[]) => tokens.map((_, index) => index).reverse()

  // table[i][j]: common words between a[i..] and b[j..]
  const table = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  )
  const length = (i: number, j: number) => table[i]?.[j] ?? 0

  indexesFromEnd(a).forEach((i) =>
    indexesFromEnd(b).forEach((j) => {
      const row = table[i]

      if (row) {
        row[j] =
          word(a, i) === word(b, j)
            ? length(i + 1, j + 1) + 1
            : Math.max(length(i + 1, j), length(i, j + 1))
      }
    }),
  )

  const changes: WordChange[] = []

  const push = (text = "", status: WordChange["status"]) => {
    const last = changes.at(-1)
    if (last?.status === status) last.text += text
    else changes.push({ text, status })
  }

  let i = 0
  let j = 0

  const step = () => {
    if (i < a.length && j < b.length && word(a, i) === word(b, j)) {
      // Equal words may differ in surrounding whitespace; show the current spacing.
      push(b[j++], "same")
      i++
    } else if (j < b.length && (i === a.length || length(i, j + 1) >= length(i + 1, j))) {
      push(b[j++], "added")
    } else if (i < a.length) {
      push(a[i++], "removed")
    }
  }

  // Every step consumes at least one token, so this many steps always reach the end.
  Array.from({ length: a.length + b.length }).forEach(step)
  return changes
}
