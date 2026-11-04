import { assertAuthenticated, GazetteerPlaceNotFoundError, GororobasApi } from "@gororobas/domain"
import { Array as EffectArray, Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { requestLocale } from "../common/request-locale.js"
import { ProfileLocationsService } from "../profiles/locations-service.js"
import { Gazetteer } from "./gazetteer.js"

const orNotFound = <A>(place: Option.Option<A>, id?: GazetteerPlaceNotFoundError["id"]) =>
  Effect.fromOption(place, () => new GazetteerPlaceNotFoundError({ id }))

export const PlacesApiLive = HttpApiBuilder.group(GororobasApi, "places", (handlers) =>
  handlers
    .handle("searchGazetteerPlaces", ({ query }) =>
      Effect.gen(function* () {
        const session = yield* assertAuthenticated
        const locale = yield* requestLocale
        const latestCountry = yield* (yield* ProfileLocationsService).latestKnownCountry({
          profileId: session.personId,
          language: locale.language,
        })

        return yield* (yield* Gazetteer).search({
          text: query.text,
          countryBias: EffectArray.dedupe([...Option.toArray(latestCountry), ...locale.countries]),
          language: locale.language,
        })
      }).pipe(withApiInfrastructureErrors({ endpoint: "searchGazetteerPlaces", group: "places" })),
    )
    .handle("getGazetteerPlace", ({ params }) =>
      Effect.gen(function* () {
        yield* assertAuthenticated
        const { language } = yield* requestLocale
        return yield* orNotFound(
          yield* (yield* Gazetteer).findPlace(params.id, language),
          params.id,
        )
      }).pipe(withApiInfrastructureErrors({ endpoint: "getGazetteerPlace", group: "places" })),
    )
    .handle("findMunicipalityContaining", ({ payload }) =>
      Effect.gen(function* () {
        yield* assertAuthenticated
        const { language } = yield* requestLocale
        return yield* orNotFound(
          yield* (yield* Gazetteer).findMunicipalityContaining(payload, language),
        )
      }).pipe(
        withApiInfrastructureErrors({ endpoint: "findMunicipalityContaining", group: "places" }),
      ),
    ),
)
