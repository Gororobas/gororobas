import { Schema } from "effect"

export const EventType = Schema.Literals([
  "Claim added",
  "Claim evaluated",
  "External data received",
])

const nodeFields = {
  id: Schema.NonEmptyString,
  title: Schema.String,
  description: Schema.String,
  position: Schema.Struct({ x: Schema.Finite, y: Schema.Finite }),
}

export const GraphNode = Schema.Union([
  Schema.Struct({ ...nodeFields, kind: Schema.Literal("event"), eventType: EventType }),
  Schema.Struct({ ...nodeFields, kind: Schema.Literal("transformation") }),
  Schema.Struct({ ...nodeFields, kind: Schema.Literal("property") }),
])

export type GraphNode = typeof GraphNode.Type

export const Canvas = Schema.Struct({
  title: Schema.NonEmptyString,
  forkedFrom: Schema.optional(Schema.String),
  nodes: Schema.Array(GraphNode),
  edges: Schema.Array(
    Schema.Struct({ source: Schema.NonEmptyString, target: Schema.NonEmptyString }),
  ),
})

export type Canvas = typeof Canvas.Type
export type GraphEdge = Canvas["edges"][number]

export const edgeId = ({ source, target }: GraphEdge) =>
  `${encodeURIComponent(source)}:${encodeURIComponent(target)}`

export function inspectGraph({ nodes, edges }: Canvas) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map(nodes.map(({ id }) => [id, new Set<string>()]))
  const outgoing = new Map(nodes.map(({ id }) => [id, new Set<string>()]))
  const errors = []
  if (byId.size !== nodes.length) errors.push("Node IDs must be unique.")

  for (const { source, target } of edges) {
    const from = byId.get(source)
    const to = byId.get(target)
    if (!from || !to) {
      errors.push("Every connection needs two existing nodes.")
      continue
    }

    if (from.kind === "transformation" ? to.kind !== "property" : to.kind !== "transformation") {
      errors.push(
        "Connect events or properties to transformations, and transformations to properties.",
      )
    }

    if (outgoing.get(source)?.has(target)) errors.push("This connection already exists.")
    outgoing.get(source)?.add(target)
    incoming.get(target)?.add(source)
  }

  const remaining = new Map(nodes.map(({ id }) => [id, incoming.get(id)?.size ?? 0]))
  const order = [...remaining].filter(([, count]) => count === 0).map(([id]) => id)

  for (const id of order) {
    for (const target of outgoing.get(id) ?? []) {
      const count = (remaining.get(target) ?? 0) - 1
      remaining.set(target, count)
      if (count === 0) order.push(target)
    }
  }

  if (order.length !== byId.size) errors.push("This graph contains a cycle.")

  const flow = nodes.map(({ id, title, kind }) => ({
    id,
    title,
    kind,
    inputs: [...(incoming.get(id) ?? [])],
    outputs: [...(outgoing.get(id) ?? [])],
  }))

  const warnings = flow.flatMap(({ id, title, kind, inputs, outputs }) => {
    const messages = []
    if (!title.trim()) messages.push("Give this node a title.")
    if (kind === "transformation" && !inputs.length) messages.push("Transformation has no inputs.")
    if (kind === "transformation" && !outputs.length) messages.push("Transformation has no output.")
    if (kind === "property" && !inputs.length) messages.push("Property has no producer.")
    if (kind === "event" && !outputs.length) messages.push("Event has no consumer.")
    return messages.map((message) => ({ id, message }))
  })

  return { errors: [...new Set(errors)], warnings, order, flow }
}
