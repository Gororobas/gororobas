import { Schema } from "effect"

import { Canvas } from "./graph.js"

/** Response bodies shared by the canvas server and the browser client. */

/** A canvas with the hash of its stored bytes, which writes must send back for optimistic concurrency. */
export const CanvasDocument = Schema.Struct({
  id: Schema.String,
  revision: Schema.String,
  canvas: Canvas,
})

export type CanvasDocument = typeof CanvasDocument.Type

export const CanvasEntry = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  forkedFrom: Schema.optional(Schema.String),
})

export type CanvasEntry = typeof CanvasEntry.Type

export const CanvasHistoryComparison = Schema.Struct({
  ref: Schema.String,
  commit: Schema.String,
  baseline: Schema.NullOr(Canvas),
  commits: Schema.Array(
    Schema.Struct({ hash: Schema.String, date: Schema.String, subject: Schema.String }),
  ),
})

export type CanvasHistoryComparison = typeof CanvasHistoryComparison.Type

export const ApiProblem = Schema.Struct({ error: Schema.String })

/** Name of the Server-Sent Event carrying a `CanvasDocument` whenever a canvas file changes. */
export const canvasChangedEvent = "canvas"
