import { ProfileLocationData } from "@gororobas/domain/profiles/locations"
import { Duration, Effect, Option, Predicate, Schedule, Schema, Stream } from "effect"
import { AsyncData } from "foldkit"

import { GororobasApiClient } from "../../../../api-client"
import { ProfileLocationsEditorBlock } from "./definition"
import { Message } from "./message"

/** Lets fast typing settle before searching. Each new text interrupts the previous search. */
const TYPING_SETTLE_TIME = Duration.millis(200)

/** Shorter texts match too many places to be useful. */
const MINIMUM_SEARCH_LENGTH = 2

export const subscriptions = ProfileLocationsEditorBlock.makeSubscriptions((entry) => ({
  locations: entry(
    "LoadMyLocations",
    { reloadCount: Schema.Int, polling: Schema.Boolean },
    {
      messages: [Message.SucceededLoadLocations, Message.FailedLoadLocations],
      modelToDependencies: (model) => ({
        reloadCount: model.reloadCount,
        polling: Option.exists(AsyncData.getData(model.locations), (locations) =>
          locations.some(
            ({ place }) =>
              ProfileLocationData.fields.place.guards.KnownPlace(place) &&
              Predicate.isTagged(place.climate, "Generating"),
          ),
        ),
      }),
      handler: function* () {
        const api = yield* GororobasApiClient

        const load = api.profiles.listMyLocations().pipe(
          Effect.match({
            onFailure: (error) => Message.FailedLoadLocations({ error: { cause: error } }),
            onSuccess: (locations) => Message.SucceededLoadLocations({ locations }),
          }),
        )

        return ({ polling }) => {
          const locations = Stream.fromEffect(load)

          return polling
            ? locations.pipe(
                Stream.filter((message) => Predicate.isTagged(message, "SucceededLoadLocations")),
                Stream.repeat(Schedule.spaced("3 seconds")),
              )
            : locations
        }
      },
    },
  ),
  places: entry(
    "SearchGazetteerPlaces",
    { maybeText: Schema.Option(Schema.String) },
    {
      messages: [Message.SucceededSearchPlaces, Message.FailedSearchPlaces],
      modelToDependencies: (model) => ({
        maybeText: Option.filter(
          Option.map(model.maybeForm, () => model.placeCombobox.inputValue.trim()),
          (text) =>
            text.length >= MINIMUM_SEARCH_LENGTH &&
            Option.exists(model.maybeForm, (form) => form.mode === "Place"),
        ),
      }),
      handler: function* () {
        const api = yield* GororobasApiClient

        return ({ maybeText }) =>
          Option.match(maybeText, {
            onNone: () => Stream.empty,
            onSome: (text) =>
              Stream.fromEffect(
                Effect.sleep(TYPING_SETTLE_TIME).pipe(
                  Effect.andThen(api.places.searchGazetteerPlaces({ query: { text } })),
                  Effect.match({
                    onFailure: () => Message.FailedSearchPlaces(),
                    onSuccess: (places) => Message.SucceededSearchPlaces({ places }),
                  }),
                ),
              ),
          })
      },
    },
  ),
}))
