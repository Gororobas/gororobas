import { Array as EffectArray, Effect, Order, Schema, DateTime } from "effect"
import { type Changeset, revertChangeset } from "json-diff-ts"

import { type GelEditSuggestion, type GelVegetable } from "../schemas/gel/entities.js"

export interface GelVegetableEdit {
  event: GelEditSuggestion
  previousState: GelVegetable
  newState: GelVegetable
}

export interface GelVegetableHistory {
  initialState: GelVegetable
  versions: Array<GelVegetable>
  edits: Array<GelVegetableEdit>
}

class GelVegetableReconstructionError extends Schema.TaggedError<GelVegetableReconstructionError>()(
  "GelVegetableReconstructionError",
  { message: Schema.String },
) {}

const revertGelVegetable = (state: GelVegetable, edit: GelEditSuggestion): GelVegetable => {
  if (!isChangeset(edit.diff)) {
    throw new GelVegetableReconstructionError({
      message: `EditSuggestion ${edit.id} does not contain a json-diff-ts changeset`,
    })
  }

  /* oxlint-disable */
  try {
    return revertChangeset(structuredClone(state), edit.diff)
  } catch (error) {
    console.log("REVERT ERROR", error, state, edit.diff)
    throw error
  }
  /* oxlint-enable */
}

const isChangeset = (value: unknown): value is Changeset => Array.isArray(value)

/**
 * Rebuild GelVegetable states from the current row by reversing merged json-diff-ts changesets.
 * The Wiki conversion intentionally happens after this step, so the history is not lossy.
 */
export const reconstructGelVegetableHistory = (
  currentState: GelVegetable,
  editSuggestions: ReadonlyArray<GelEditSuggestion>,
): Effect.Effect<GelVegetableHistory, GelVegetableReconstructionError> =>
  Effect.try({
    try: () => {
      const mergedEdits = EffectArray.sort(
        editSuggestions.filter((edit) => edit.status === "MERGED"),
        Order.mapInput(Order.flip(Order.Number), (edit: GelEditSuggestion) =>
          DateTime.toEpochMillis(edit.created_at),
        ),
      )
      const reconstruction = EffectArray.reduce(
        mergedEdits,
        { state: structuredClone(currentState), reverseEdits: new Array<GelVegetableEdit>() },
        (accumulator, event) => {
          const previousState = revertGelVegetable(accumulator.state, event)
          return {
            state: previousState,
            reverseEdits: [
              ...accumulator.reverseEdits,
              { event, previousState, newState: accumulator.state },
            ],
          }
        },
      )
      const edits = [...reconstruction.reverseEdits].reverse()
      return {
        initialState: reconstruction.state,
        versions: [reconstruction.state, ...edits.map((edit) => edit.newState)],
        edits,
      }
    },
    catch: (error) =>
      error instanceof GelVegetableReconstructionError
        ? error
        : new GelVegetableReconstructionError({ message: String(error) }),
  })
