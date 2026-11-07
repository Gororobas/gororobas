import { Combobox } from "@foldkit/ui"
import { InformationVisibility } from "@gororobas/domain/common/enums"
import { WhosOnFirstId } from "@gororobas/domain/common/external-identifiers"
import { ProfileLocationId } from "@gororobas/domain/common/ids"
import { GazetteerPlace, GazetteerPlaceSummary } from "@gororobas/domain/places/domain"
import { ElevationInMeters, ProfileLocationData } from "@gororobas/domain/profiles/locations"
import { Schema } from "effect"
import { AsyncData } from "foldkit"

import { ClientFailure } from "../../lib/client-failure"

export const PlaceCombobox = Combobox.makeBlock(WhosOnFirstId)

export const Locations = AsyncData.Schema(Schema.Array(ProfileLocationData), ClientFailure)

export const FormMode = Schema.Literals(["Place", "FreeText"])
export type FormMode = typeof FormMode.Type

/** Where finding the municipality around the device stands: asked for, under way, or refused. */
export const DeviceLookup = Schema.Literals(["Idle", "Locating", "Unavailable", "OutsideGazetteer"])

export type DeviceLookup = typeof DeviceLookup.Type

/** Why the form can't be saved, which the view says in the reader's language. */
export const FormError = Schema.Literals([
  "PlaceLoadFailed",
  "StartYearMissing",
  "StartYearInvalid",
  "EndYearMissing",
  "EndYearInvalid",
  "FreeTextMissing",
  "PlaceMissing",
  "EndBeforeStart",
  "SaveFailed",
])

export type FormError = typeof FormError.Type

export const Form = Schema.Struct({
  maybeEditingId: Schema.Option(ProfileLocationId),
  mode: FormMode,
  freeText: Schema.String,
  /** The chosen place, with its outline to show what gets saved. */
  maybePlace: Schema.Option(GazetteerPlace),
  label: Schema.String,
  /** Only from a device inside the chosen place, never typed. */
  maybeElevation: Schema.Option(ElevationInMeters),
  deviceLookup: DeviceLookup,
  startYear: Schema.String,
  startMonth: Schema.String,
  /** Still there: the entry has no end, whatever end was typed before. */
  isOngoing: Schema.Boolean,
  endYear: Schema.String,
  endMonth: Schema.String,
  visibility: InformationVisibility,
  isSaving: Schema.Boolean,
  maybeError: Schema.Option(FormError),
})

export type Form = typeof Form.Type

export const Model = Schema.Struct({
  locations: Locations.schema,
  /** Bumped after every change, so the timeline reloads. */
  reloadCount: Schema.Int,
  maybeForm: Schema.Option(Form),
  placeCombobox: PlaceCombobox.Model,
  searchResults: Schema.Array(GazetteerPlaceSummary),
  /** Removing asks first: the entry waiting for that answer. */
  maybeConfirmingDeleteId: Schema.Option(ProfileLocationId),
  maybeDeletingId: Schema.Option(ProfileLocationId),
  /** Only removing an entry fails in the list itself. */
  maybeListError: Schema.Option(Schema.Literal("DeleteFailed")),
})

export type Model = typeof Model.Type
