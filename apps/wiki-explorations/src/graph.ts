import { Effect, Match, Schema } from "effect"

export const EventType = Schema.Literals(["Claim", "External data"])
export const ArchitectureConfidence = Schema.Literals(["NOT_REVIEWED", "LOCKED_IN", "UNCERTAIN"])
export const defaultArchitectureConfidence = "NOT_REVIEWED"

export const architectureConfidenceLabels = {
  NOT_REVIEWED: "Pending",
  LOCKED_IN: "Locked",
  UNCERTAIN: "Uncertain",
} satisfies Record<typeof ArchitectureConfidence.Type, string>

export const ExampleDataText = Schema.fromJsonString(Schema.Json, { space: 2 })
const encodeExampleData = Schema.encodeSync(ExampleDataText)

export const formatExampleData = (value: Schema.Json | undefined) =>
  value === undefined ? "" : encodeExampleData(value)

const nodeFields = {
  id: Schema.NonEmptyString,
  title: Schema.String,
  description: Schema.String,
  architectureConfidence: ArchitectureConfidence.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(defaultArchitectureConfidence)),
  ),
  position: Schema.Struct({ x: Schema.Finite, y: Schema.Finite }),
}

const dataFields = { ...nodeFields, exampleData: Schema.optional(Schema.Json) }
const eventFields = { ...dataFields, kind: Schema.Literal("event") }

const otherNodes = [
  Schema.Struct({ ...nodeFields, kind: Schema.Literal("transformation") }),
  Schema.Struct({ ...dataFields, kind: Schema.Literal("property") }),
  Schema.Struct({ ...dataFields, kind: Schema.Literal("trigger") }),
] as const

export const GraphNode = Schema.Union([
  Schema.Struct({
    ...eventFields,
    eventType: Schema.Literal("Claim"),
    isEvaluationRequired: Schema.Boolean,
  }),
  Schema.Struct({ ...eventFields, eventType: Schema.Literal("External data") }),
  ...otherNodes,
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

const LegacyCanvas = Schema.Struct({
  ...Canvas.fields,
  nodes: Schema.Array(
    Schema.Union([
      Schema.Struct({
        ...eventFields,
        eventType: Schema.Literals(["Claim added", "Claim evaluated", "External data received"]),
      }),
      ...otherNodes,
    ]),
  ),
})

const decodeCurrentCanvas = Schema.decodeEffect(Schema.fromJsonString(Canvas))
const decodeLegacyCanvas = Schema.decodeEffect(Schema.fromJsonString(LegacyCanvas))

export const decodeCanvasFile = (content: string) =>
  decodeCurrentCanvas(content).pipe(
    Effect.catch(() =>
      decodeLegacyCanvas(content).pipe(
        Effect.map((canvas): Canvas => {
          const evaluations = new Set(
            canvas.nodes.flatMap((node) =>
              node.kind === "event" && node.eventType === "Claim evaluated" ? [node.id] : [],
            ),
          )

          // Legacy canvases linked a claim and its evaluation to the same transformation.
          const evaluatedTargets = new Set(
            canvas.edges
              .filter(({ source }) => evaluations.has(source))
              .map(({ target }) => target),
          )

          const evaluatedClaims = new Set(
            canvas.edges
              .filter(({ target }) => evaluatedTargets.has(target))
              .map(({ source }) => source),
          )

          return {
            ...canvas,
            nodes: canvas.nodes.flatMap((node): GraphNode[] => {
              if (node.kind !== "event") return [node]

              if (node.eventType === "Claim evaluated") return []
              if (node.eventType === "External data received") {
                return [{ ...node, eventType: "External data" }]
              }

              return [
                { ...node, eventType: "Claim", isEvaluationRequired: evaluatedClaims.has(node.id) },
              ]
            }),
            edges: canvas.edges.filter(
              ({ source, target }) => !evaluations.has(source) && !evaluations.has(target),
            ),
          }
        }),
      ),
    ),
  )

/**
 * A trigger's outgoing edges point at the events it causes, such as an external data fetch. They
 * don't carry data, so a trigger can read what those events later update (to decide whether to
 * fire again) without the canvas becoming cyclic.
 */
export const isTriggerEdge = (edge: GraphEdge, byId: ReadonlyMap<string, GraphNode>) =>
  byId.get(edge.source)?.kind === "trigger"

const connects = (from: GraphNode, to: GraphNode) =>
  Match.value(from.kind).pipe(
    Match.when("transformation", () => to.kind === "property"),
    Match.when("trigger", () => to.kind === "event"),
    Match.when("property", () => to.kind === "transformation" || to.kind === "trigger"),
    Match.when("event", () => to.kind === "transformation"),
    Match.exhaustive,
  )

export const edgeId = ({ source, target }: GraphEdge) =>
  `${encodeURIComponent(source)}:${encodeURIComponent(target)}`

export function inspectGraph({ nodes, edges }: Canvas) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const incoming = new Map(nodes.map(({ id }) => [id, new Set<string>()]))
  const outgoing = new Map(nodes.map(({ id }) => [id, new Set<string>()]))
  const dataOutgoing = new Map(nodes.map(({ id }) => [id, new Set<string>()]))
  const dataIncoming = new Map<string, number>()
  const errors = []
  if (byId.size !== nodes.length) errors.push("Node IDs must be unique.")

  for (const { source, target } of edges) {
    const from = byId.get(source)
    const to = byId.get(target)
    if (!from || !to) {
      errors.push("Every connection needs two existing nodes.")
      continue
    }

    if (!connects(from, to)) {
      errors.push(
        "Connect events or properties to transformations, transformations to properties, properties to triggers, and triggers to events.",
      )
    }

    if (outgoing.get(source)?.has(target)) errors.push("This connection already exists.")
    outgoing.get(source)?.add(target)
    incoming.get(target)?.add(source)
    if (!isTriggerEdge({ source, target }, byId)) {
      dataOutgoing.get(source)?.add(target)
      dataIncoming.set(target, (dataIncoming.get(target) ?? 0) + 1)
    }
  }

  const remaining = new Map(nodes.map(({ id }) => [id, dataIncoming.get(id) ?? 0]))
  const order = [...remaining].filter(([, count]) => count === 0).map(([id]) => id)

  for (const id of order) {
    for (const target of dataOutgoing.get(id) ?? []) {
      const count = (remaining.get(target) ?? 0) - 1
      remaining.set(target, count)
      if (count === 0) order.push(target)
    }
  }

  if (order.length !== byId.size) errors.push("This graph contains a cycle.")

  const flow = nodes.map(({ id, title, kind, architectureConfidence }) => ({
    id,
    title,
    kind,
    architectureConfidence,
    inputs: [...(incoming.get(id) ?? [])],
    outputs: [...(outgoing.get(id) ?? [])],
  }))

  return { errors: [...new Set(errors)], order, flow }
}

export const withoutNodes = (canvas: Canvas, ids: ReadonlySet<string>): Canvas => ({
  ...canvas,
  nodes: canvas.nodes.filter(({ id }) => !ids.has(id)),
  edges: canvas.edges.filter(({ source, target }) => !ids.has(source) && !ids.has(target)),
})
