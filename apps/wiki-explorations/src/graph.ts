import { Effect, Hash, Match, Schema } from "effect"

import { legacyExampleSchema } from "./legacy-example-schema.js"

export const EventType = Schema.Literals(["Claim", "External data", "Report", "Person"])
export const ArchitectureConfidence = Schema.Literals(["NOT_REVIEWED", "LOCKED_IN", "UNCERTAIN"])
export const defaultArchitectureConfidence = "NOT_REVIEWED"

export const architectureConfidenceLabels = {
  NOT_REVIEWED: "Pending",
  LOCKED_IN: "Locked",
  UNCERTAIN: "Uncertain",
} satisfies Record<typeof ArchitectureConfidence.Type, string>

const nodeFields = {
  id: Schema.NonEmptyString,
  title: Schema.String,
  description: Schema.String,
  architectureConfidence: ArchitectureConfidence.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(defaultArchitectureConfidence)),
  ),
  position: Schema.Struct({ x: Schema.Finite, y: Schema.Finite }),
  /** Markdown. Required while the node is uncertain, so the doubt is written down. */
  openQuestions: Schema.optional(Schema.String),
  /** Fingerprint of the content when the node was locked, to flag edits made since. */
  lockedContentHash: Schema.optional(Schema.String),
}

const dataFields = { ...nodeFields, exampleSchema: Schema.optional(Schema.String) }
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
  Schema.Struct({
    ...eventFields,
    eventType: Schema.Literals(["External data", "Report", "Person"]),
  }),
  ...otherNodes,
])

export type GraphNode = typeof GraphNode.Type

const encodeFingerprint = Schema.encodeSync(Schema.fromJsonString(Schema.Json))

/** Everything a lock vouches for. Position and confidence can change freely. */
const contentHash = (node: GraphNode) =>
  (
    Hash.string(
      encodeFingerprint([
        node.kind,
        node.kind === "event" ? node.eventType : null,
        node.kind === "event" && node.eventType === "Claim" ? node.isEvaluationRequired : null,
        node.title,
        node.description,
        node.openQuestions ?? null,
        node.kind === "transformation" ? null : (node.exampleSchema ?? null),
      ]),
    ) >>> 0
  ).toString(16)

export type LockIntegrity = "INTACT" | "CHANGED" | "UNVERIFIED"

/** Whether a locked node still has the content it was locked with. Undefined when it isn't locked. */
export const lockIntegrity = (node: GraphNode): LockIntegrity | undefined => {
  if (node.architectureConfidence !== "LOCKED_IN") return undefined
  if (node.lockedContentHash === undefined) return "UNVERIFIED"
  return node.lockedContentHash === contentHash(node) ? "INTACT" : "CHANGED"
}

export const isMissingOpenQuestions = (node: GraphNode) =>
  node.architectureConfidence === "UNCERTAIN" && (node.openQuestions ?? "").trim() === ""

export const lockWarnings = {
  CHANGED:
    "Changed since it was locked. Review the changes, for example in Git history, then accept them or revert.",
  UNVERIFIED:
    "Locked before fingerprints existed, so changes can't be detected. Accept to fingerprint the current content.",
} satisfies Record<Exclude<LockIntegrity, "INTACT">, string>

export const lockContent = (node: GraphNode): GraphNode => ({
  ...node,
  lockedContentHash: contentHash(node),
})

/**
 * Keeps the fingerprint in step with an editor edit. Locking, and editing a lock that was intact,
 * fingerprint the new content. A changed or unverified lock stays flagged until it's accepted, so
 * an unrelated edit can't hide edits made outside the editor.
 */
export const withLockFingerprint = (before: GraphNode, after: GraphNode): GraphNode => {
  if (after.architectureConfidence !== "LOCKED_IN") {
    return { ...after, lockedContentHash: undefined }
  }
  return before.architectureConfidence !== "LOCKED_IN" || lockIntegrity(before) === "INTACT"
    ? lockContent(after)
    : after
}

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

const readLegacyExamples = Schema.decodeEffect(
  Schema.fromJsonString(
    Schema.Struct({
      nodes: Schema.Array(
        Schema.Struct({ id: Schema.String, exampleData: Schema.optionalKey(Schema.Json) }),
      ),
    }),
  ),
)

const decodeCanvas = (content: string) =>
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

export const decodeCanvasFile = (content: string) =>
  Effect.gen(function* () {
    const canvas = yield* decodeCanvas(content)
    const { nodes } = yield* readLegacyExamples(content)
    const examples = new Map(nodes.map(({ id, exampleData }) => [id, exampleData]))

    return {
      ...canvas,
      nodes: canvas.nodes.map((node) => {
        if (node.kind === "transformation" || node.exampleSchema !== undefined) return node
        const example = examples.get(node.id)
        return example === undefined
          ? node
          : { ...node, exampleSchema: legacyExampleSchema(example) }
      }),
    }
  })

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

  // Warnings don't block saving: a node switched to uncertain has no questions until they're typed.
  const warnings = nodes
    .filter(isMissingOpenQuestions)
    .map(({ title }) => `“${title.trim() || "Untitled"}” is uncertain but has no open questions.`)

  return { errors: [...new Set(errors)], warnings, order, flow }
}

export const withoutNodes = (canvas: Canvas, ids: ReadonlySet<string>): Canvas => ({
  ...canvas,
  nodes: canvas.nodes.filter(({ id }) => !ids.has(id)),
  edges: canvas.edges.filter(({ source, target }) => !ids.has(source) && !ids.has(target)),
})
