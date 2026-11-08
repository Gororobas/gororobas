import { inputId } from "@foldkit/ui/combobox"
import type { Block } from "foldkit"

import { ProfileLocationsEditorBlock } from "./definition"
import { type FormMode, PlaceCombobox } from "./model"
import { clearPlaceStep, selectPlaceStep } from "./place-selection"

export const PLACE_COMBOBOX_ID = "profile-locations-editor-place"
export const FREE_TEXT_INPUT_ID = "profile-locations-editor-free-text"

export const CONFIRM_DELETE_BUTTON_ID = "profile-locations-editor-confirm-delete"

export const entryMenuButtonId = (id: string) => `profile-locations-editor-menu-button-${id}`

/** The field that names the place, where focus goes when the form opens or changes mode. */
export const placeFieldId = (mode: FormMode) =>
  mode === "Place" ? inputId(PLACE_COMBOBOX_ID) : FREE_TEXT_INPUT_ID

export const PlaceComboboxBinding = ProfileLocationsEditorBlock.makeRequiredFieldBinding(
  PlaceCombobox,
  {
    field: "placeCombobox",
    init: { contextToArgs: () => [{ id: PLACE_COMBOBOX_ID, nullable: true }] },
  },
).withOutMessagePolicy({
  fold: ProfileLocationsEditorBlock.makeOutMessageFold(PlaceCombobox, {
    Selected: ({ value }) => selectPlaceStep(value),
    ClearedSelection: () => clearPlaceStep,
  }),
})

export const ProfileLocationsEditorComposition = ProfileLocationsEditorBlock.makeComposition({
  bindings: [PlaceComboboxBinding],
})
export type ProfileLocationsEditorViewBuilder = Block.ViewBuilderFor<
  typeof ProfileLocationsEditorComposition
>
