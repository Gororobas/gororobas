import type { CanvasDocument } from "./canvas-api.js"
import type { Canvas } from "./graph.js"

const historyLimit = 100

/** One open canvas: what's on disk, the live (possibly unsaved) canvas and its undo history. */
export type CanvasSession = {
  readonly id: string
  /** Hash of `persisted` as stored on disk; writes send it back to detect concurrent edits. */
  readonly revision: string
  readonly persisted: Canvas
  readonly canvas: Canvas
  readonly past: ReadonlyArray<Canvas>
  readonly future: ReadonlyArray<Canvas>
  /** Consecutive edits sharing a group (typing in one field) undo together. */
  readonly editGroup: symbol | undefined
  readonly saveError: string | undefined
}

export const openSession = ({ id, revision, canvas }: CanvasDocument): CanvasSession => ({
  id,
  revision,
  persisted: canvas,
  canvas,
  past: [],
  future: [],
  editGroup: undefined,
  saveError: undefined,
})

export const hasUnsavedChanges = (session: CanvasSession) => session.canvas !== session.persisted

export function edit(
  session: CanvasSession,
  { canvas, group }: { canvas: Canvas; group?: symbol | undefined },
): CanvasSession {
  if (session.canvas === canvas) return session
  const startsStep = group === undefined || session.editGroup !== group

  return {
    ...session,
    canvas,
    past: startsStep ? [...session.past, session.canvas].slice(-historyLimit) : session.past,
    future: [],
    editGroup: group,
  }
}

export function step(session: CanvasSession, direction: "undo" | "redo"): CanvasSession {
  const source = direction === "undo" ? session.past : session.future
  const previous = source.at(-1)
  if (!previous) return session
  const remaining = source.slice(0, -1)
  const destination = [...(direction === "undo" ? session.future : session.past), session.canvas]

  return {
    ...session,
    canvas: previous,
    past: direction === "undo" ? remaining : destination,
    future: direction === "undo" ? destination : remaining,
    editGroup: undefined,
  }
}

/** `saved` is the canvas that was written, which may be older than the live one by now. */
export const markSaved = (
  session: CanvasSession,
  { saved, revision }: { saved: Canvas; revision: string },
): CanvasSession => ({
  ...session,
  persisted: saved,
  revision,
  saveError: undefined,
})

/**
 * Applies a change read from disk. Echoes of this tab's own writes carry the known revision.
 * With unsaved edits the remote change is left alone: the next write conflicts and says so.
 */
export function receive(session: CanvasSession, document: CanvasDocument): CanvasSession {
  if (document.revision === session.revision || hasUnsavedChanges(session)) return session
  // Undoing past a change made elsewhere would silently revert it.
  return openSession(document)
}
