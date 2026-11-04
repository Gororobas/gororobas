import { inputId } from "@foldkit/ui/combobox"
import type { Block } from "foldkit"

import { MyPlacesDefinition } from "./definition"
import { type FormMode, PlaceCombobox } from "./model"
import { clearPlaceStep, selectPlaceStep } from "./place-selection"

export const PLACE_COMBOBOX_ID = "my-places-place"
export const FREE_TEXT_INPUT_ID = "my-places-free-text"

export const CONFIRM_DELETE_BUTTON_ID = "my-places-confirm-delete"

export const entryMenuButtonId = (id: string) => `my-places-menu-button-${id}`

/** The field that names the place, where focus goes when the form opens or changes mode. */
export const placeFieldId = (mode: FormMode) =>
  mode === "Place" ? inputId(PLACE_COMBOBOX_ID) : FREE_TEXT_INPUT_ID

export const PlaceComboboxBinding = MyPlacesDefinition.makeBinding(PlaceCombobox, {
  field: "placeCombobox",
  init: { contextToArgs: () => [{ id: PLACE_COMBOBOX_ID, nullable: true }] },
}).withOutMessagePolicy({
  fold: MyPlacesDefinition.makeOutMessageFold(PlaceCombobox, {
    Selected: ({ value }) => selectPlaceStep(value),
    ClearedSelection: () => clearPlaceStep,
  }),
})

export const MyPlacesComposition = MyPlacesDefinition.makeComposition({
  bindings: [PlaceComboboxBinding],
})
export type MyPlacesViewBuilder = Block.ViewBuilderFor<typeof MyPlacesComposition>
