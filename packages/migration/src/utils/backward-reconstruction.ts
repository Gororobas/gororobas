import { WikiPlantArticle } from "@gororobas/domain"
import { Effect, Array as EffectArray, Option, Order, Predicate, Schema } from "effect"
import { revertChangeset, type Changeset, type IChange } from "json-diff-ts"

import {
  GelEditSuggestion,
  GelVegetable,
  GelVegetableForReconstruction,
} from "../schemas/gel/entities.js"

export const GelVegetableEdit = Schema.Struct({
  edit_suggestion: Schema.Option(GelEditSuggestion),
  state: GelVegetableForReconstruction,
})
export type GelVegetableEdit = typeof GelVegetableEdit.Type

export const VegetableHistoryEntryForMigration = Schema.Struct({
  ...GelVegetableEdit.fields,
  article: WikiPlantArticle.EditableArticle,
})
export type VegetableHistoryEntryForMigration = typeof VegetableHistoryEntryForMigration.Type

export const VegetableDataForMigration = Schema.Struct({
  latest_source: GelVegetableForReconstruction,
  edit_suggestions: Schema.Array(GelEditSuggestion),
  history: Schema.Array(VegetableHistoryEntryForMigration),
})
export type VegetableDataForMigration = typeof VegetableDataForMigration.Type

export const GelVegetableHistory = Schema.Array(GelVegetableEdit)
export type GelVegetableHistory = typeof GelVegetableHistory.Type

class GelVegetableReconstructionError extends Schema.TaggedError<GelVegetableReconstructionError>()(
  "GelVegetableReconstructionError",
  { message: Schema.String, error: Schema.optional(Schema.Unknown) },
) {}

const revertGelVegetable = Effect.fn("revertGelVegetable")(function* (
  state: GelVegetable,
  edit: GelEditSuggestion,
) {
  const diff = edit.diff
  if (!isChangeset(diff)) {
    return yield* new GelVegetableReconstructionError({
      message: `EditSuggestion ${edit.id} does not contain a json-diff-ts changeset`,
    })
  }

  const reverted = yield* Effect.try({
    try: () => revertChangeset(structuredClone(state), normalizeChangeset(diff, state)),
    catch: (error) =>
      new GelVegetableReconstructionError({
        message: `EditSuggestion ${edit.id} failed`,
        error,
      }),
  })
  return yield* Schema.decodeUnknownEffect(GelVegetableForReconstruction)({ ...state, ...reverted })
})

const isChangeset = (value: unknown): value is Changeset => Array.isArray(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Predicate.isObject(value) && !Array.isArray(value)

const normalizeChangeset = (changeset: Changeset, target: unknown): Changeset =>
  changeset.map((change): IChange => {
    if (!change.changes) return change

    const child = isRecord(target) ? target[change.key] : undefined
    const embeddedKey =
      Array.isArray(child) &&
      change.embeddedKey === undefined &&
      child.every((item) => isRecord(item) && Predicate.isString(item.id))
        ? "id"
        : change.embeddedKey

    const changes = Array.isArray(child)
      ? change.changes.map((nestedChange) => {
          const nestedTarget =
            embeddedKey === "id"
              ? child.find((item) => isRecord(item) && item.id === nestedChange.key)
              : child[Number(nestedChange.key)]
          return nestedChange.changes
            ? {
                ...nestedChange,
                changes: normalizeChangeset(nestedChange.changes, nestedTarget),
              }
            : nestedChange
        })
      : normalizeChangeset(change.changes, child)

    return {
      ...change,
      ...(embeddedKey === undefined ? {} : { embeddedKey }),
      changes,
    }
  })

/**
 * Rebuild GelVegetable states from the current row by reversing merged json-diff-ts changesets.
 * The Wiki conversion intentionally happens after this step, so the history is not lossy.
 */
export const reconstructGelVegetableHistory = (
  currentState: GelVegetableForReconstruction,
  editSuggestions: ReadonlyArray<GelEditSuggestion>,
): Effect.Effect<GelVegetableHistory, GelVegetableReconstructionError> =>
  Effect.gen(function* () {
    const mergedEdits = EffectArray.sort(
      editSuggestions.filter((edit) => edit.status === "MERGED"),
      Order.mapInput(Order.flip(Order.Number), (edit: GelEditSuggestion) =>
        (edit.updated_at ?? edit.created_at).getTime(),
      ),
    )
    const reconstruction = yield* Effect.reduce(
      mergedEdits,
      () => ({
        state: structuredClone(currentState),
        history: new Array<GelVegetableEdit>(),
      }),
      (accumulator, edit_suggestion) =>
        Effect.gen(function* () {
          const previousState = yield* revertGelVegetable(accumulator.state, edit_suggestion)
          return {
            state: previousState,
            history: [
              ...accumulator.history,
              GelVegetableEdit.make({
                edit_suggestion: Option.some(edit_suggestion),
                state: accumulator.state,
              }),
            ],
          }
        }),
    )

    return [
      {
        edit_suggestion: Option.none(),
        state: reconstruction.state,
      },
      ...reconstruction.history.reverse(),
    ]
  }).pipe(
    Effect.mapError((error) =>
      error instanceof GelVegetableReconstructionError
        ? error
        : new GelVegetableReconstructionError({ message: String(error) }),
    ),
  )
