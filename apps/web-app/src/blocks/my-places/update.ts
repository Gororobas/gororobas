import type { InformationVisibility } from "@gororobas/domain/common/enums"
import { gazetteerPlaceLabel } from "@gororobas/domain/places/domain"
import {
  ProfileLocationData,
  ProfileLocationPlaceInput as PlaceInput,
} from "@gororobas/domain/profiles/locations"
import { DateTime, Array as EffectArray, Option, Order, Result } from "effect"
import { AsyncData, Update } from "foldkit"
import { modifyFields } from "foldkit/struct"

import { type DateParts, DeleteLocation, FocusElement, LocateDevice, SaveLocation } from "./command"
import {
  CONFIRM_DELETE_BUTTON_ID,
  entryMenuButtonId,
  MyPlacesComposition,
  PlaceComboboxBinding,
  placeFieldId,
} from "./composition"
import { makeFieldsStep, makeStep } from "./definition"
import { Form, Locations, type Model } from "./model"

/** New entries default to how the person shared their latest addition, or to private. */
const defaultVisibility = (model: Model): InformationVisibility =>
  Option.match(AsyncData.getData(model.locations), {
    onNone: () => "PRIVATE",
    onSome: EffectArray.match({
      onEmpty: (): InformationVisibility => "PRIVATE",
      onNonEmpty: (locations) =>
        EffectArray.max(
          locations,
          Order.mapInput(DateTime.Order, (location) => location.createdAt),
        ).visibility,
    }),
  })

const emptyForm = (visibility: InformationVisibility): Form => ({
  maybeEditingId: Option.none(),
  mode: "Place",
  freeText: "",
  maybePlace: Option.none(),
  label: "",
  maybeElevation: Option.none(),
  deviceLocation: "Idle",
  startYear: "",
  startMonth: "",
  isOngoing: true,
  endYear: "",
  endMonth: "",
  visibility,
  isSaving: false,
  maybeError: Option.none(),
})

const datePartsText = (date: ProfileLocationData["startDate"]) =>
  date === null
    ? { year: "", month: "" }
    : { year: String(date.year), month: "month" in date ? String(date.month) : "" }

const editForm = (location: ProfileLocationData): Form => {
  const start = datePartsText(location.startDate)
  const end = datePartsText(location.endDate)

  return {
    ...emptyForm(location.visibility),
    maybeEditingId: Option.some(location.id),
    mode: LocationPlace.guards.FreeText(location.place) ? "FreeText" : "Place",
    freeText: LocationPlace.guards.FreeText(location.place) ? location.place.text : "",
    maybePlace: LocationPlace.guards.KnownPlace(location.place)
      ? Option.fromNullishOr(location.place.gazetteerPlace)
      : Option.none(),
    label: LocationPlace.guards.KnownPlace(location.place) ? (location.place.label ?? "") : "",
    maybeElevation: LocationPlace.guards.KnownPlace(location.place)
      ? Option.fromNullishOr(location.place.elevation)
      : Option.none(),
    startYear: start.year,
    startMonth: start.month,
    isOngoing: location.endDate === null,
    endYear: end.year,
    endMonth: end.month,
  }
}

const LocationPlace = ProfileLocationData.fields.place

const withForm = (model: Model, change: (form: Form) => Form): Model =>
  modifyFields(model, { maybeForm: Option.map(change) })

/** The entered year and month, or why they can't be saved. */
const dateParts = ({
  year,
  month,
  name,
}: Readonly<{
  year: string
  month: string
  name: "início" | "fim"
}>): Result.Result<Option.Option<DateParts>, string> => {
  if (year.trim() === "") {
    return month === "" ? Result.succeed(Option.none()) : Result.fail(`Informe o ano de ${name}.`)
  }

  const yearNumber = Number(year)
  if (!Number.isInteger(yearNumber) || yearNumber < 1900 || yearNumber > 2100) {
    return Result.fail(`O ano de ${name} precisa ter quatro dígitos, como 2024.`)
  }

  return Result.succeed(
    Option.some({
      year: yearNumber,
      maybeMonth: month === "" ? Option.none() : Option.some(Number(month)),
    }),
  )
}

/**
 * Empties the place search's text. Closing only rewrites the text of an open combobox, so it
 * opens first.
 */
const resetCombobox = () =>
  Update.combineSteps([PlaceComboboxBinding.requestOpen(), PlaceComboboxBinding.requestClose("")])

export const update = MyPlacesComposition.makeUpdate({
  SucceededLoadLocations: (model, { locations }) => ({
    model: modifyFields(model, { locations: () => Locations.Success({ data: locations }) }),
  }),
  FailedLoadLocations: (model, { error }) => ({
    model: modifyFields(model, { locations: () => Locations.Failure({ error }) }),
  }),

  ClickedAddLocation: (model) =>
    Update.combineSteps(model, [
      makeFieldsStep(() => ({
        maybeForm: () => Option.some(emptyForm(defaultVisibility(model))),
        searchResults: () => [],
        maybeConfirmingDeleteId: () => Option.none(),
      })),
      resetCombobox(),
    ]),
  ClickedEditLocation: (model, { id }) => {
    const location = Option.flatMap(AsyncData.getData(model.locations), (locations) =>
      EffectArray.findFirst(locations, (candidate) => candidate.id === id),
    )

    return Option.match(location, {
      onNone: () => ({ model }),
      onSome: (existing) => {
        const form = editForm(existing)

        return Update.combineSteps(model, [
          makeFieldsStep(() => ({
            maybeForm: () => Option.some(form),
            searchResults: () => Option.toArray(form.maybePlace),
            maybeConfirmingDeleteId: () => Option.none(),
          })),
          // The search field starts from the saved place, so people see what they're changing.
          Option.match(form.maybePlace, {
            onNone: resetCombobox,
            onSome: (place) =>
              PlaceComboboxBinding.requestSelectItem(place.id, gazetteerPlaceLabel(place)),
          }),
          // Selecting and resetting focus the search field; a free-text entry focuses its own.
          ...(form.mode === "FreeText"
            ? [
                makeStep((current) => ({
                  model: current,
                  commands: [FocusElement({ id: placeFieldId(form.mode) })],
                })),
              ]
            : []),
        ])
      },
    })
  },
  ClickedCancelForm: (model) => ({
    model: modifyFields(model, { maybeForm: () => Option.none() }),
  }),
  ChoseMode: (model, { mode }) => ({
    model: withForm(model, (form) => ({ ...form, mode, maybeError: Option.none() })),
    commands: [FocusElement({ id: placeFieldId(mode) })],
  }),
  ToggledOngoing: (model, { isOngoing }) => ({
    model: withForm(model, (form) => ({ ...form, isOngoing })),
  }),
  UpdatedFreeText: (model, { value }) => ({
    model: withForm(model, (form) => ({ ...form, freeText: value })),
  }),
  UpdatedLabel: (model, { value }) => ({
    model: withForm(model, (form) => ({ ...form, label: value })),
  }),
  UpdatedDate: (model, { field, value }) => ({
    model: withForm(model, (form) => ({ ...form, [field]: value })),
  }),
  ChoseVisibility: (model, { visibility }) => ({
    model: withForm(model, (form) => ({ ...form, visibility })),
  }),
  ClickedRemoveElevation: (model) => ({
    model: withForm(model, (form) => ({ ...form, maybeElevation: Option.none() })),
  }),

  SucceededSearchPlaces: (model, { places }) => ({
    model: modifyFields(model, { searchResults: () => places }),
  }),
  FailedSearchPlaces: (model) => ({ model }),
  SucceededLoadPlace: (model, { place }) => ({
    model: withForm(model, (form) => ({ ...form, maybePlace: Option.some(place) })),
  }),
  FailedLoadPlace: (model) => ({
    model: withForm(model, (form) => ({
      ...form,
      maybeError: Option.some("Não foi possível carregar esse lugar. Tente novamente."),
    })),
  }),

  ClickedUseDeviceLocation: (model) => ({
    model: withForm(model, (form) => ({ ...form, deviceLocation: "Locating" })),
    commands: [LocateDevice()],
  }),
  SucceededLocateDevice: (model, { place, maybeElevation }) =>
    Update.combineSteps(model, [
      makeStep((current) => ({
        model: modifyFields(
          withForm(current, (form) => ({
            ...form,
            mode: "Place",
            maybePlace: Option.some(place),
            maybeElevation,
            deviceLocation: "Idle",
            maybeError: Option.none(),
          })),
          { searchResults: () => [place] },
        ),
      })),
      PlaceComboboxBinding.requestSelectItem(place.id, gazetteerPlaceLabel(place)),
    ]),
  FailedLocateDevice: (model, { reason }) => ({
    model: withForm(model, (form) => ({ ...form, deviceLocation: reason })),
  }),

  CompletedFocusElement: (model) => ({ model }),

  SubmittedForm: (model) =>
    Option.match(model.maybeForm, {
      onNone: () => ({ model }),
      onSome: (form) => {
        const fail = (error: string) => ({
          model: withForm(model, (current) => ({ ...current, maybeError: Option.some(error) })),
        })
        const start = dateParts({ year: form.startYear, month: form.startMonth, name: "início" })
        if (Result.isFailure(start)) return fail(start.failure)
        const end = form.isOngoing
          ? Result.succeed(Option.none<DateParts>())
          : dateParts({ year: form.endYear, month: form.endMonth, name: "fim" })
        if (Result.isFailure(end)) return fail(end.failure)

        if (form.mode === "FreeText" && form.freeText.trim() === "") {
          return fail("Descreva onde você está.")
        }
        if (form.mode === "Place" && Option.isNone(form.maybePlace)) {
          return fail("Escolha um lugar da lista ou use a localização do aparelho.")
        }

        const place =
          form.mode === "FreeText" || Option.isNone(form.maybePlace)
            ? PlaceInput.cases.FreeText.make({ text: form.freeText.trim() })
            : PlaceInput.cases.GazetteerPlace.make({
                gazetteerPlaceId: form.maybePlace.value.id,
                label: Option.filter(Option.some(form.label.trim()), (label) => label !== ""),
                elevation: form.maybeElevation,
              })

        return {
          model: withForm(model, (current) => ({
            ...current,
            isSaving: true,
            maybeError: Option.none(),
          })),
          commands: [
            SaveLocation({
              maybeId: form.maybeEditingId,
              draft: {
                place,
                maybeStart: start.success,
                maybeEnd: end.success,
                visibility: form.visibility,
              },
            }),
          ],
        }
      },
    }),
  SucceededSaveLocation: (model) => ({
    model: modifyFields(model, {
      maybeForm: () => Option.none(),
      reloadCount: (count) => count + 1,
    }),
  }),
  FailedSaveLocation: (model, { message }) => ({
    model: withForm(model, (form) => ({
      ...form,
      isSaving: false,
      maybeError: Option.some(message),
    })),
  }),

  ClickedDeleteLocation: (model, { id }) => ({
    model: modifyFields(model, {
      maybeConfirmingDeleteId: () => Option.some(id),
      maybeListError: () => Option.none(),
    }),
    commands: [FocusElement({ id: CONFIRM_DELETE_BUTTON_ID })],
  }),
  CancelledDeleteLocation: (model) => ({
    model: modifyFields(model, { maybeConfirmingDeleteId: () => Option.none() }),
    commands: EffectArray.fromOption(
      Option.map(model.maybeConfirmingDeleteId, (id) =>
        FocusElement({ id: entryMenuButtonId(id) }),
      ),
    ),
  }),
  ConfirmedDeleteLocation: (model, { id }) => ({
    model: modifyFields(model, {
      maybeConfirmingDeleteId: () => Option.none(),
      maybeDeletingId: () => Option.some(id),
      maybeListError: () => Option.none(),
    }),
    commands: [DeleteLocation({ id })],
  }),
  SucceededDeleteLocation: (model) => ({
    model: modifyFields(model, {
      maybeDeletingId: () => Option.none(),
      reloadCount: (count) => count + 1,
    }),
  }),
  FailedDeleteLocation: (model, { message }) => ({
    model: modifyFields(model, {
      maybeDeletingId: () => Option.none(),
      maybeListError: () => Option.some(message),
    }),
  }),
})
