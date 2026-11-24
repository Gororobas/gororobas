import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"

import type { Canvas } from "./graph.js"
import { pipelineAround } from "./pipeline.js"

const NodeIndex = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 11 }))

/** Edges only point from a lower to a higher index, so every generated graph is acyclic. */
function canvasFrom(pairs: ReadonlyArray<readonly [number, number]>): Canvas {
  const edges = pairs
    .filter(([a, b]) => a !== b)
    .map(([a, b]) => ({ source: `${Math.min(a, b)}`, target: `${Math.max(a, b)}` }))

  return {
    title: "Generated",
    nodes: Array.from({ length: 12 }, (_, index) => ({
      id: `${index}`,
      title: `${index}`,
      description: "",
      architectureConfidence: "NOT_REVIEWED" as const,
      position: { x: 0, y: 0 },
      kind: "transformation" as const,
    })),
    edges: edges.filter(
      (edge, index) =>
        edges.findIndex(
          ({ source, target }) => source === edge.source && target === edge.target,
        ) === index,
    ),
  }
}

describe("pipelineAround", () => {
  it.prop(
    "places every node further from the focus than whatever it feeds upstream, and the reverse downstream",
    { pairs: Schema.Array(Schema.Tuple([NodeIndex, NodeIndex])), focus: NodeIndex },
    ({ pairs, focus }) => {
      const canvas = canvasFrom(pairs)
      const { upstream, downstream, steps } = pipelineAround(canvas, `${focus}`)
      const up = (id: string) => (id === `${focus}` ? 0 : upstream.get(id))
      const down = (id: string) => (id === `${focus}` ? 0 : downstream.get(id))

      // Undefined means the node isn't on that side of the pipeline, so there's nothing to order.
      const further = (a: number | undefined, b: number | undefined) =>
        a === undefined || b === undefined || a > b
      const step = (id: string) => {
        const index = steps.findIndex((candidate) => candidate.id === id)
        return index === -1 ? undefined : index
      }

      assert.isTrue(
        canvas.edges.every(
          ({ source, target }) =>
            further(up(source), up(target)) &&
            further(down(target), down(source)) &&
            further(step(target), step(source)),
        ),
      )
    },
  )
})
