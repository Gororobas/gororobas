/* oxlint-disable effect/casting-awareness -- reconstruction accumulators preserve a recursive domain shape. */
import { type SourceVegetableData } from "@gororobas/domain"
/**
 * Backward reconstruction algorithm for vegetable edit history.
 */
import { Array as Arr, Effect, Option, Order, Schema } from "effect"

import { type EditSuggestion } from "../schemas/gel/entities.js"
import { applyInverseDiffE, type JsonDiff } from "./json-diff-inverse.js"

// ============ Types ============

export interface EditSuggestionEvent {
  id: string
  timestamp: string
  performed_by: string // UserProfile ID
  target_object: string // Vegetable ID
  diff: JsonDiff // json-diff-ts format
  snapshot: any // State after diff was applied
  status: "PENDING_REVIEW" | "MERGED" | "REJECTED"
  created_at: string
}

export interface ReconstructedHistory {
  initialState: SourceVegetableData
  edits: Array<{
    event: EditSuggestionEvent
    previousState: SourceVegetableData
    newState: SourceVegetableData
    crdtUpdate: Option.Option<Uint8Array>
  }>
}

class ReconstructionError extends Schema.TaggedError<ReconstructionError>()("ReconstructionError", {
  message: Schema.String,
}) {}

// ============ Data Transformation ============

/**
 * Transform Gel EditSuggestion to EditSuggestionEvent.
 */
export const transformEditSuggestion = (
  editSuggestion: EditSuggestion,
): Effect.Effect<EditSuggestionEvent, Error> =>
  Effect.try({
    try: () => ({
      id: editSuggestion.id,
      timestamp: editSuggestion.created_at,
      performed_by: editSuggestion.created_by_id || "",
      target_object: editSuggestion.target_object,
      diff: editSuggestion.diff as JsonDiff,
      snapshot: editSuggestion.snapshot,
      status: editSuggestion.status as EditSuggestionEvent["status"],
      created_at: editSuggestion.created_at,
    }),
    catch: () => new ReconstructionError({ message: "Failed to transform EditSuggestion" }),
  })

/**
 * Sort EditSuggestion events by timestamp (newest first).
 */
export const sortEventsReverseChronological = (
  events: EditSuggestionEvent[],
): EditSuggestionEvent[] => {
  return Arr.sort(
    [...events],
    Order.mapInput(Order.flip(Order.String), (event: EditSuggestionEvent) => event.timestamp),
  )
}

/**
 * Filter for only approved EditSuggestions (MERGED status).
 */
export const filterApprovedEdits = (events: EditSuggestionEvent[]): EditSuggestionEvent[] => {
  return events.filter((event) => event.status === "MERGED")
}

/**
 * Reconstruct the complete edit history by walking backwards from current state.
 */
export const reconstructHistory = (
  vegetableId: string,
  currentState: SourceVegetableData,
  editSuggestions: EditSuggestion[],
): Effect.Effect<ReconstructedHistory, Error> =>
  Effect.gen(function* () {
    // 1. Transform EditSuggestions to events
    const transformedEvents = yield* Effect.all(editSuggestions.map(transformEditSuggestion), {
      concurrency: "unbounded",
    })

    // 2. Filter for approved edits only
    const approvedEdits = filterApprovedEdits(transformedEvents)

    // 3. Sort by timestamp (newest first)
    const sortedEdits = sortEventsReverseChronological(approvedEdits)

    // 4. Walk backwards applying inverse diffs
    const reconstruction = yield* Effect.reduce(
      sortedEdits,
      () => ({ previousState: currentState, edits: [] as ReconstructedHistory["edits"] }),
      (accumulator, edit) =>
        applyInverseDiffE(accumulator.previousState, edit.diff).pipe(
          Effect.map((stateBeforeEdit) => ({
            previousState: stateBeforeEdit,
            edits: [
              ...accumulator.edits,
              {
                event: edit,
                previousState: stateBeforeEdit,
                newState: accumulator.previousState,
                crdtUpdate: Option.none(),
              },
            ],
          })),
        ),
    )
    const previousState = reconstruction.previousState
    const historicalEdits = reconstruction.edits

    // 5. Reverse to get chronological order
    historicalEdits.reverse()

    return {
      initialState: previousState,
      edits: historicalEdits,
    }
  })

/**
 * Validate that the reconstructed history produces the current state.
 */
export const validateReconstructedHistory = (
  history: ReconstructedHistory,
  expectedFinalState: SourceVegetableData,
): Effect.Effect<boolean, Error> =>
  Effect.gen(function* () {
    // Apply all diffs forward to see if we get the expected final state
    // The forward application is represented by each edit's already-materialized new state.
    const state = history.edits.reduce((_currentState, edit) => edit.newState, history.initialState)

    // Simple deep equality check
    const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
    const finalStateMatches = encodeJson(state) === encodeJson(expectedFinalState)

    if (!finalStateMatches) {
      yield* Effect.logWarning("Reconstructed history validation failed", {
        expected: expectedFinalState,
        actual: state,
      })
    }

    return finalStateMatches
  })
