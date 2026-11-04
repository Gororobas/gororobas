import { WhosOnFirstId } from "@gororobas/domain/common/external-identifiers"
import { ProfileLocationId } from "@gororobas/domain/common/ids"
import type { PartialDate } from "@gororobas/domain/common/utils/dates"
import { Coordinates } from "@gororobas/domain/places/geometry"
import { ProfileLocationPayload } from "@gororobas/domain/profiles/locations"
import { Effect, Layer, Option, Predicate, Schema } from "effect"
import * as Dom from "foldkit/dom"

import { GororobasApiClient } from "../../api-client"
import { ProfileLocationsEditorDefinition } from "./definition"
import { Message } from "./message"

export const LoadPlace = ProfileLocationsEditorDefinition.makeCommand("LoadPlace", {
  args: { id: WhosOnFirstId },
  messages: [Message.SucceededLoadPlace, Message.FailedLoadPlace],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ id }) =>
      api.places.getGazetteerPlace({ params: { id } }).pipe(
        Effect.match({
          onFailure: () => Message.FailedLoadPlace(),
          onSuccess: (place) => Message.SucceededLoadPlace({ place }),
        }),
      )
  },
})

/**
 * Finds the municipality around the device. The coordinates only travel to the server's lookup,
 * which doesn't keep them.
 */
export const FindMunicipality = ProfileLocationsEditorDefinition.makeCommand("FindMunicipality", {
  args: { coordinates: Coordinates },
  messages: [Message.SucceededFindMunicipality, Message.FailedFindMunicipality],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ coordinates }) =>
      api.places.findMunicipalityContaining({ payload: coordinates }).pipe(
        Effect.map((place) => Message.SucceededFindMunicipality({ place })),
        Effect.catchTag("GazetteerPlaceNotFoundError", () =>
          Effect.succeed(Message.FailedFindMunicipality({ reason: "OutsideGazetteer" })),
        ),
        Effect.orElseSucceed(() => Message.FailedFindMunicipality({ reason: "Unavailable" })),
      )
  },
})

/** Moves focus where the next step happens, such as the form's first field once it opens. */
export const FocusElement = ProfileLocationsEditorDefinition.makeCommand("FocusElement", {
  args: { id: Schema.String },
  messages: [Message.CompletedFocusElement],
  handler: function* () {
    return ({ id }) =>
      // The element may be gone by now, such as when the form closed meanwhile.
      Dom.focus(`#${CSS.escape(id)}`).pipe(
        Effect.catchTag("ElementNotFound", () => Effect.void),
        Effect.as(Message.CompletedFocusElement()),
      )
  },
})

const SAVE_FAILED = "Não foi possível salvar o lugar. Tente novamente."

/** A year, and optionally a month: how precisely people remember when they lived somewhere. */
export const DateParts = Schema.Struct({ year: Schema.Int, maybeMonth: Schema.Option(Schema.Int) })
export type DateParts = typeof DateParts.Type

/** An entry before its dates get the device's timezone. */
export const LocationDraft = Schema.Struct({
  place: ProfileLocationPayload.fields.place,
  maybeStart: Schema.Option(DateParts),
  maybeEnd: Schema.Option(DateParts),
  visibility: ProfileLocationPayload.fields.visibility,
})

export type LocationDraft = typeof LocationDraft.Type

const toPartialDate = (parts: DateParts, timezone: string): PartialDate =>
  Option.match(parts.maybeMonth, {
    onNone: () => ({ precision: "year", year: parts.year, timezone }),
    onSome: (month) => ({ precision: "month", year: parts.year, month, timezone }),
  })

export const SaveLocation = ProfileLocationsEditorDefinition.makeCommand("SaveLocation", {
  args: { maybeId: Schema.Option(ProfileLocationId), draft: LocationDraft },
  messages: [Message.SucceededSaveLocation, Message.FailedSaveLocation],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ maybeId, draft }) => {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

      const payload: ProfileLocationPayload = {
        place: draft.place,
        startDate: Option.map(draft.maybeStart, (parts) => toPartialDate(parts, timezone)),
        endDate: Option.map(draft.maybeEnd, (parts) => toPartialDate(parts, timezone)),
        visibility: draft.visibility,
      }

      const toMessage = Effect.match({
        onFailure: (error: { readonly _tag: string }) =>
          Message.FailedSaveLocation({
            message: Predicate.isTagged(error, "InvalidProfileLocationDatesError")
              ? "O fim não pode vir antes do começo."
              : SAVE_FAILED,
          }),
        onSuccess: () => Message.SucceededSaveLocation(),
      })

      return Option.match(maybeId, {
        onNone: () => api.profiles.addMyLocation({ payload }).pipe(toMessage),
        onSome: (id) => api.profiles.updateMyLocation({ params: { id }, payload }).pipe(toMessage),
      })
    }
  },
})

export const DeleteLocation = ProfileLocationsEditorDefinition.makeCommand("DeleteLocation", {
  args: { id: ProfileLocationId },
  messages: [Message.SucceededDeleteLocation, Message.FailedDeleteLocation],
  handler: function* () {
    const api = yield* GororobasApiClient

    return ({ id }) =>
      api.profiles.deleteMyLocation({ params: { id } }).pipe(
        Effect.match({
          onFailure: () =>
            Message.FailedDeleteLocation({ message: "Não foi possível remover. Tente novamente." }),
          onSuccess: () => Message.SucceededDeleteLocation(),
        }),
      )
  },
})

export const CommandsLayer = Layer.mergeAll(
  LoadPlace.layer,
  FindMunicipality.layer,
  FocusElement.layer,
  SaveLocation.layer,
  DeleteLocation.layer,
)
