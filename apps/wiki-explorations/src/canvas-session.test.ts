import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"

import { edit, markSaved, openSession, receive, step } from "./canvas-session.js"
import type { Canvas } from "./graph.js"

const canvasTitled = (title: string): Canvas => ({ title, nodes: [], edges: [] })
const opened = openSession({ id: "canvas", revision: "r0", canvas: canvasTitled("Start") })
const Titles = Schema.Array(Schema.String)

describe("canvas session", () => {
  it.prop(
    "undoing every ungrouped edit restores the start, and redoing replays them",
    [Titles],
    ([titles]) => {
      const edited = titles.reduce(
        (session, title) => edit(session, { canvas: canvasTitled(title) }),
        opened,
      )
      const undone = titles.reduce((session) => step(session, "undo"), edited)
      assert.strictEqual(undone.canvas, opened.canvas)
      const redone = titles.reduce((session) => step(session, "redo"), undone)
      assert.strictEqual(redone.canvas, edited.canvas)
    },
  )

  it.prop("edits sharing a group undo as one step", [Titles], ([titles]) => {
    const group = Symbol()
    const edited = titles.reduce(
      (session, title) => edit(session, { canvas: canvasTitled(title), group }),
      opened,
    )
    assert.strictEqual(step(edited, "undo").canvas, opened.canvas)
  })

  it("ignores echoes of its own writes and changes that would overwrite unsaved edits", () => {
    const saved = markSaved(edit(opened, { canvas: canvasTitled("Saved") }), {
      saved: canvasTitled("Saved"),
      revision: "r1",
    })
    assert.strictEqual(
      receive(saved, { id: "canvas", revision: "r1", canvas: opened.canvas }),
      saved,
    )

    const unsaved = edit(opened, { canvas: canvasTitled("Unsaved") })
    const remote = { id: "canvas", revision: "r2", canvas: canvasTitled("Remote") }
    assert.strictEqual(receive(unsaved, remote), unsaved)
  })

  it("replaces a saved canvas changed elsewhere, dropping undo history that would revert it", () => {
    const edited = edit(opened, { canvas: canvasTitled("Local") })
    const saved = markSaved(edited, { saved: edited.canvas, revision: "r1" })
    const remote = { id: "canvas", revision: "r2", canvas: canvasTitled("Remote") }
    const received = receive(saved, remote)

    assert.strictEqual(received.canvas, remote.canvas)
    assert.strictEqual(received.revision, "r2")
    assert.deepEqual(received.past, [])
  })
})
