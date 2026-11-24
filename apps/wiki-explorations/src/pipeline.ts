import { Array as EffectArray, Order } from "effect"

import { type Canvas, type GraphNode, isTriggerEdge } from "./graph.js"

type Adjacency = ReadonlyMap<string, readonly string[]>

/**
 * Longest hop count from each node reached through `next` back to `start`.
 * Longest (not shortest) so every node sits after all of its own inputs, which
 * makes "sources first" a valid reading order. Canvases are acyclic once trigger
 * edges are left out: the server rejects cycles.
 */
function distances({
  start,
  next,
  previous,
}: {
  start: string
  next: Adjacency
  previous: Adjacency
}) {
  const reached = new Set<string>()
  const queue = [start]

  for (const id of queue) {
    for (const neighbour of next.get(id) ?? []) {
      if (reached.has(neighbour)) continue
      reached.add(neighbour)
      queue.push(neighbour)
    }
  }

  const memo = new Map<string, number>([[start, 0]])

  const distance = (id: string): number => {
    const known = memo.get(id)
    if (known !== undefined) return known

    const hops =
      1 +
      Math.max(
        ...(previous.get(id) ?? [])
          .filter((neighbour) => neighbour === start || reached.has(neighbour))
          .map(distance),
      )

    memo.set(id, hops)
    return hops
  }

  return new Map([...reached].map((id) => [id, distance(id)]))
}

/** Everything that feeds into a node and everything it feeds, with hop distances from it. */
export function pipelineAround(canvas: Canvas, focusId: string) {
  const byId = new Map(canvas.nodes.map((node) => [node.id, node]))
  const inputs = new Map<string, string[]>()
  const outputs = new Map<string, string[]>()
  for (const { source, target } of canvas.edges.filter((edge) => !isTriggerEdge(edge, byId))) {
    inputs.set(target, [...(inputs.get(target) ?? []), source])
    outputs.set(source, [...(outputs.get(source) ?? []), target])
  }

  const upstream = distances({ start: focusId, next: inputs, previous: outputs })
  const downstream = distances({ start: focusId, next: outputs, previous: inputs })
  const nodes = (ids: Iterable<string>) => [...ids].flatMap((id) => byId.get(id) ?? [])
  const furthestFirst = Order.mapInput(
    Order.flip(Order.Number),
    ({ id }: GraphNode) => upstream.get(id) ?? 0,
  )

  const focus = byId.get(focusId)
  const ancestors = EffectArray.sort(nodes(upstream.keys()), furthestFirst)

  return {
    focus,
    byId,
    inputs,
    outputs,
    upstream,
    downstream,
    /** Transformations that produce the focus, in an order where each reads only earlier steps. */
    steps: [...ancestors, ...(focus?.kind === "transformation" ? [focus] : [])].filter(
      ({ kind }) => kind === "transformation",
    ),
    sourceEvents: ancestors.filter(({ kind }) => kind === "event"),
  }
}

export type Pipeline = ReturnType<typeof pipelineAround>

export type UpstreamBranch = {
  node: GraphNode
  /** Already expanded earlier in the tree, so its inputs aren't repeated. */
  repeated: boolean
  inputs: UpstreamBranch[]
}

/** The focus and its inputs, recursively, with shared nodes expanded only once. */
export function upstreamTree({ focus, byId, inputs }: Pipeline): UpstreamBranch | undefined {
  const expanded = new Set<string>()

  const branch = (node: GraphNode): UpstreamBranch => {
    const repeated = expanded.has(node.id)
    expanded.add(node.id)

    return {
      node,
      repeated,
      inputs: repeated
        ? []
        : (inputs.get(node.id) ?? []).flatMap((id) => {
            const input = byId.get(id)
            return input ? [branch(input)] : []
          }),
    }
  }

  return focus && branch(focus)
}
