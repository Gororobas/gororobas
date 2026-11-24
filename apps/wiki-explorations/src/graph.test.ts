import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

import { diffCanvas, diffWords } from "./canvas-diff.js"
import {
  ArchitectureConfidence,
  Canvas,
  decodeCanvasFile,
  GraphNode,
  inspectGraph,
  isMissingOpenQuestions,
  lockContent,
  lockIntegrity,
  withLockFingerprint,
} from "./graph.js"

const fileWith = (fields: Record<string, string | boolean>) =>
  JSON.stringify({
    title: "Architecture decisions",
    nodes: [
      {
        id: "name-claim",
        title: "Name claim",
        description: "",
        position: { x: 0, y: 0 },
        kind: "event",
        ...fields,
      },
    ],
    edges: [],
  })

describe("architecture confidence", () => {
  it.effect("defaults older canvas files and reports a confidence-only edit in history", () =>
    Effect.gen(function* () {
      const legacy = yield* decodeCanvasFile(fileWith({ eventType: "Claim added" }))
      const baseline = yield* decodeCanvasFile(
        fileWith({ eventType: "Claim", isEvaluationRequired: false }),
      )

      const current = yield* decodeCanvasFile(
        fileWith({
          eventType: "Claim",
          isEvaluationRequired: false,
          architectureConfidence: "LOCKED_IN",
        }),
      )

      assert.deepEqual(legacy, baseline)
      assert.strictEqual(baseline.nodes[0]?.architectureConfidence, "NOT_REVIEWED")
      assert.deepEqual(diffCanvas(baseline, current).nodes[0]?.fields, [
        { label: "Architecture confidence", before: "Pending", after: "Locked" },
      ])
    }),
  )

  it.effect.prop(
    "preserves confidence when saving and reopening",
    [ArchitectureConfidence],
    ([architectureConfidence]) =>
      Effect.gen(function* () {
        const canvas = yield* decodeCanvasFile(
          fileWith({ eventType: "External data", architectureConfidence }),
        )
        const content = yield* Schema.encodeEffect(Schema.fromJsonString(Canvas))(canvas)
        const reopened = yield* decodeCanvasFile(content)
        assert.strictEqual(reopened.nodes[0]?.architectureConfidence, architectureConfidence)
      }),
  )
})

describe("triggers", () => {
  const node = (id: string, kind: "transformation" | "property" | "trigger") => ({
    id,
    title: id,
    description: "",
    architectureConfidence: "NOT_REVIEWED" as const,
    position: { x: 0, y: 0 },
    kind,
  })

  const loop = (triggerKind: "transformation" | "trigger"): Canvas => ({
    title: "Fetch loop",
    nodes: [
      node("observations", "property"),
      node("fetch", triggerKind),
      {
        ...node("received", "transformation"),
        kind: "event",
        eventType: "External data",
      },
      node("index", "transformation"),
    ],
    edges: [
      { source: "observations", target: "fetch" },
      { source: "fetch", target: "received" },
      { source: "received", target: "index" },
      { source: "index", target: "observations" },
    ],
  })

  it("may read what the events it causes later update", () => {
    assert.deepEqual(inspectGraph(loop("trigger")).errors, [])
    assert.include(inspectGraph(loop("transformation")).errors, "This graph contains a cycle.")
  })
})

describe("locks", () => {
  const reopen = (node: GraphNode) =>
    Effect.gen(function* () {
      const file = Schema.fromJsonString(Canvas)
      const content = yield* Schema.encodeEffect(file)({ title: "Lock", nodes: [node], edges: [] })
      const reopened = (yield* Schema.decodeEffect(file)(content)).nodes[0]
      assert.isDefined(reopened)
      // The editor sends nodes to the API as plain JSON, without encoding them first.
      const sent = yield* Schema.decodeEffect(GraphNode)(reopened)
      assert.deepEqual(sent, reopened)
      return reopened
    })

  it.effect.prop(
    "flag content edits made outside the editor until they're accepted",
    [GraphNode, Schema.String],
    ([node, title]) =>
      Effect.gen(function* () {
        const locked = yield* reopen(lockContent({ ...node, architectureConfidence: "LOCKED_IN" }))
        assert.strictEqual(lockIntegrity(locked), "INTACT")
        assert.strictEqual(
          lockIntegrity({ ...locked, position: { x: locked.position.x + 1, y: 0 } }),
          "INTACT",
        )

        const tampered = { ...locked, description: `${locked.description} ` }
        assert.strictEqual(lockIntegrity(tampered), "CHANGED")
        // An unrelated edit in the editor mustn't hide the earlier change.
        const edited = withLockFingerprint(tampered, { ...tampered, title })
        assert.strictEqual(lockIntegrity(edited), "CHANGED")
        assert.strictEqual(lockIntegrity(lockContent(edited)), "INTACT")
        assert.strictEqual(
          lockIntegrity(withLockFingerprint(locked, { ...locked, title: `${title}!` })),
          "INTACT",
        )
      }),
  )
})

describe("open questions", () => {
  it.prop(
    "are required only while uncertain, and never block saving",
    [GraphNode, Schema.UndefinedOr(Schema.String)],
    ([node, openQuestions]) => {
      const candidate = { ...node, openQuestions }
      const isBlank = (openQuestions ?? "").trim() === ""
      assert.strictEqual(
        isMissingOpenQuestions(candidate),
        candidate.architectureConfidence === "UNCERTAIN" && isBlank,
      )
      const { errors, warnings } = inspectGraph({ title: "Q", nodes: [candidate], edges: [] })
      assert.deepEqual(errors, [])
      assert.strictEqual(warnings.length, isMissingOpenQuestions(candidate) ? 1 : 0)
    },
  )
})

describe("word diff", () => {
  it.prop(
    "rebuilds the current text and keeps every word of the previous one",
    [Schema.String, Schema.String],
    ([before, after]) => {
      const changes = diffWords(before, after)
      const words = (text: string) => text.split(/\s+/).filter(Boolean)
      assert.strictEqual(
        changes.flatMap(({ text, status }) => (status === "removed" ? [] : [text])).join(""),
        after,
      )
      assert.deepEqual(
        words(changes.flatMap(({ text, status }) => (status === "added" ? [] : [text])).join("")),
        words(before),
      )
    },
  )
})
