import { Combobox } from "@foldkit/ui"
import { InformationVisibility } from "@gororobas/domain/common/enums"
import { WhosOnFirstId } from "@gororobas/domain/common/external-identifiers"
import { ProfileLocationId } from "@gororobas/domain/common/ids"
import { GazetteerPlace, GazetteerPlaceSummary } from "@gororobas/domain/places/domain"
import { ElevationInMeters, ProfileLocationData } from "@gororobas/domain/profiles/locations"
import { Schema } from "effect"
import { AsyncData } from "foldkit"

import { ClientFailure } from "../../lib/client-failure"

export const PlaceCombobox = Combobox.create(WhosOnFirstId)

export const Locations = AsyncData.Schema(Schema.Array(ProfileLocationData), ClientFailure)

export const FormMode = Schema.Literals(["Place", "FreeText"])
export type FormMode = typeof FormMode.Type

/** Where the device's position stands: asked for, being resolved, or refused. */
export const DeviceLocation = Schema.Literals([
  "Idle",
  "Locating",
  "Unavailable",
  "OutsideGazetteer",
])

export type DeviceLocation = typeof DeviceLocation.Type

export const Form = Schema.Struct({
  maybeEditingId: Schema.Option(ProfileLocationId),
  mode: FormMode,
  freeText: Schema.String,
  /** The chosen place, with its outline to show what gets saved. */
  maybePlace: Schema.Option(GazetteerPlace),
  label: Schema.String,
  /** Only from the device, never typed. */
  maybeElevation: Schema.Option(ElevationInMeters),
  deviceLocation: DeviceLocation,
  startYear: Schema.String,
  startMonth: Schema.String,
  /** Still there: the entry has no end, whatever end was typed before. */
  isOngoing: Schema.Boolean,
  endYear: Schema.String,
  endMonth: Schema.String,
  visibility: InformationVisibility,
  isSaving: Schema.Boolean,
  maybeError: Schema.Option(Schema.String),
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
  maybeListError: Schema.Option(Schema.String),
})

export type Model = typeof Model.Type
