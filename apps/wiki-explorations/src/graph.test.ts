import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"

import { diffCanvas } from "./canvas-diff.js"
import { ArchitectureConfidence, Canvas, decodeCanvasFile, inspectGraph } from "./graph.js"

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
        { label: "Architecture confidence", before: "Not reviewed", after: "Locked in" },
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
