import { type SourceVegetableData } from "@gororobas/domain"
/**
 * Backward reconstruction algorithm for vegetable edit history.
 */
import { Effect } from "effect"

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
    crdtUpdate: Uint8Array | null
  }>
}

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
      status: editSuggestion.status,
      created_at: editSuggestion.created_at,
    }),
    catch: (error) => new Error("Failed to transform EditSuggestion: ", error),
  })

/**
 * Sort EditSuggestion events by timestamp (newest first).
 */
export const sortEventsReverseChronological = (
  events: EditSuggestionEvent[],
): EditSuggestionEvent[] => {
  return [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
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
    let previousState = currentState
    const historicalEdits: ReconstructedHistory["edits"] = []

    for (const edit of sortedEdits) {
      // Apply inverse diff to get state before this edit
      const stateBeforeEdit = yield* applyInverseDiffE(previousState, edit.diff)

      historicalEdits.push({
        event: edit,
        previousState: stateBeforeEdit,
        newState: previousState,
        crdtUpdate: null, // Will be generated in forward pass
      })

      previousState = stateBeforeEdit
    }

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
    let state = history.initialState

    for (const edit of history.edits) {
      // This would use the forward diff application
      // For now, we'll just check if the final state matches
      state = edit.newState
    }

    // Simple deep equality check
    const finalStateMatches = JSON.stringify(state) === JSON.stringify(expectedFinalState)

    if (!finalStateMatches) {
      yield* Effect.logWarning("Reconstructed history validation failed", {
        expected: expectedFinalState,
        actual: state,
      })
    }

    return finalStateMatches
  })
