import { InformationVisibility } from "@gororobas/domain/common/enums"
import { ProfileLocationId } from "@gororobas/domain/common/ids"
import { GazetteerPlace, GazetteerPlaceSummary } from "@gororobas/domain/places/domain"
import { ProfileLocationData } from "@gororobas/domain/profiles/locations"
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"

import { ClientFailure } from "../../lib/client-failure"
import { FormError } from "./model"
import { DeviceLookup, FormMode } from "./model"

export const DateField = Schema.Literals(["startYear", "startMonth", "endYear", "endMonth"])
export type DateField = typeof DateField.Type

export const Message = defineMessageUnion({
  SucceededLoadLocations: { locations: Schema.Array(ProfileLocationData) },
  FailedLoadLocations: { error: ClientFailure },

  ClickedAddLocation: {},
  ClickedEditLocation: { id: ProfileLocationId },
  ClickedCancelForm: {},
  ChoseMode: { mode: FormMode },
  ToggledOngoing: { isOngoing: Schema.Boolean },
  UpdatedFreeText: { value: Schema.String },
  UpdatedLabel: { value: Schema.String },
  UpdatedDate: { field: DateField, value: Schema.String },
  ChoseVisibility: { visibility: InformationVisibility },
  ClickedRemoveElevation: {},

  SucceededSearchPlaces: { places: Schema.Array(GazetteerPlaceSummary) },
  FailedSearchPlaces: {},
  SucceededLoadPlace: { place: GazetteerPlace },
  FailedLoadPlace: {},

  ClickedUseDeviceLocation: {},
  SucceededFindMunicipality: { place: GazetteerPlace },
  FailedFindMunicipality: { reason: DeviceLookup },

  CompletedFocusElement: {},

  SubmittedForm: {},
  SucceededSaveLocation: {},
  FailedSaveLocation: { error: FormError },

  ClickedDeleteLocation: { id: ProfileLocationId },
  ConfirmedDeleteLocation: { id: ProfileLocationId },
  CancelledDeleteLocation: {},
  SucceededDeleteLocation: {},
  FailedDeleteLocation: {},
})

export const OutMessage = defineMessageUnion({
  /** Using the device's position: the application reads it and informs the editor. */
  RequestedDeviceLocation: {},
})
