/**
 * Location timelines for people and organizations, through the same service people use, so
 * known places become PLACE articles the way they do in the app.
 *
 * Places come from searching the gazetteer for a few names: the fixture has all of them, and a
 * built gazetteer finds them too.
 */
import {
  CountryCode,
  InformationVisibility,
  type PartialDate,
  type ProfileId,
  type ProfileLocationPayload,
} from "@gororobas/domain"
import { DateTime, Array as EffectArray, Effect, Option, Random } from "effect"

import { Gazetteer } from "../places/gazetteer.js"
import { ProfileLocationsService } from "../profiles/locations-service.js"
import { activePeople, type SeedContext } from "./seed-context.js"
import { chance, pick, pickWeighted } from "./seed-random.js"
import { FREE_TEXT_LOCATIONS, LOCATION_LABELS, PLACES } from "./vocabulary.js"

/** Searches that find the seed's places, with the timezone their dates are in. */
const SEED_PLACE_SEARCHES = [
  { text: "Villa de Leyva", timezone: "America/Bogota" },
  { text: "Madrid", timezone: "America/Bogota" },
  { text: "Viçosa", timezone: "America/Sao_Paulo" },
  { text: "Boyacá", timezone: "America/Bogota" },
] as const

const year = (value: number, timezone: string): PartialDate => ({
  precision: "year",
  year: value,
  timezone,
})

const sum = (counts: ReadonlyArray<number>) => counts.reduce((total, count) => total + count, 0)

export const seedProfileLocations = (
  context: Pick<SeedContext, "people" | "organizations" | "timeline">,
) =>
  Effect.gen(function* () {
    const gazetteer = yield* Gazetteer
    const locations = yield* ProfileLocationsService
    const anchorYear = DateTime.getPartUtc(
      DateTime.makeUnsafe(context.timeline.anchorMillis),
      "year",
    )

    const places = EffectArray.dedupeWith(
      (yield* Effect.forEach(
        SEED_PLACE_SEARCHES,
        ({ text, timezone }) =>
          Effect.map(
            gazetteer.search({
              text,
              countryBias: [CountryCode.make("CO"), CountryCode.make("BR")],
              language: "pt",
              limit: 1,
            }),
            (found) => found.map((place) => ({ place, timezone })),
          ),
        { concurrency: 1 },
      )).flat(),
      (a, b) => a.place.id === b.place.id,
    )

    const randomPlace = Effect.gen(function* () {
      if (!EffectArray.isReadonlyArrayNonEmpty(places) || !(yield* chance(0.6))) {
        const text = (yield* chance(0.5)) ? yield* pick(FREE_TEXT_LOCATIONS) : yield* pick(PLACES)
        return { input: { _tag: "FreeText" as const, text }, timezone: "America/Sao_Paulo" }
      }
      const { place, timezone } = yield* pick(places)

      return {
        input: {
          _tag: "GazetteerPlace" as const,
          gazetteerPlaceId: place.id,
          label: (yield* chance(0.3)) ? Option.some(yield* pick(LOCATION_LABELS)) : Option.none(),
          elevation: (yield* chance(0.3))
            ? Option.some((yield* Random.nextIntBetween(0, 360)) * 10)
            : Option.none(),
        },
        timezone,
      }
    })

    const randomPayload = Effect.gen(function* () {
      const { input, timezone } = yield* randomPlace
      const startYear = (yield* chance(0.7))
        ? Option.some(yield* Random.nextIntBetween(anchorYear - 15, anchorYear))
        : Option.none<number>()

      const endYear =
        Option.isSome(startYear) && (yield* chance(0.4))
          ? Option.some(
              Math.min(anchorYear, startYear.value + (yield* Random.nextIntBetween(0, 6))),
            )
          : Option.none<number>()

      return {
        place: input,
        startDate: Option.map(startYear, (value) => year(value, timezone)),
        endDate: Option.map(endYear, (value) => year(value, timezone)),
        visibility: yield* pickWeighted(InformationVisibility.literals, {
          PUBLIC: 3,
          COMMUNITY: 2,
          PRIVATE: 2,
        }),
      } satisfies ProfileLocationPayload
    })

    const seedTimeline = ({
      profileId,
      joinedAt,
      count,
    }: Readonly<{ profileId: ProfileId; joinedAt: number; count: number }>) =>
      Effect.forEach(
        EffectArray.range(1, count),
        () =>
          Effect.gen(function* () {
            const at = yield* context.timeline.between(joinedAt)
            const payload = yield* randomPayload
            yield* context.timeline.at(at)(locations.add({ profileId, payload, language: "pt" }))
          }),
        { concurrency: 1, discard: true },
      ).pipe(Effect.as(count))

    // Cora, the community persona, grows in Villa de Leyva and shares it publicly.
    const community = context.people.find((person) => person.handle === "community")
    const villaDeLeyva = places.find(({ place }) => place.name === "Villa de Leyva")?.place

    const personaCount =
      community === undefined || villaDeLeyva === undefined
        ? 0
        : yield* context.timeline.at(context.timeline.daysBeforeAnchor(30))(
            Effect.gen(function* () {
              yield* locations.add({
                profileId: community.id,
                payload: {
                  place: { _tag: "FreeText", text: "Viajando por aí" },
                  startDate: Option.some(year(anchorYear - 6, "America/Sao_Paulo")),
                  endDate: Option.some(year(anchorYear - 2, "America/Sao_Paulo")),
                  visibility: "COMMUNITY",
                },
                language: "pt",
              })

              yield* locations.add({
                profileId: community.id,
                payload: {
                  place: {
                    _tag: "GazetteerPlace",
                    gazetteerPlaceId: villaDeLeyva.id,
                    label: Option.some("Sítio na estrada para Sáchica"),
                    elevation: Option.some(2150),
                  },
                  startDate: Option.some(year(anchorYear - 1, "America/Bogota")),
                  endDate: Option.none(),
                  visibility: "PUBLIC",
                },
                language: "pt",
              })

              return 2
            }),
          )

    const peopleCounts = yield* Effect.forEach(
      activePeople(context).filter((person) => person.handle !== "community"),
      (person) =>
        Effect.gen(function* () {
          return yield* seedTimeline({
            profileId: person.id,
            joinedAt: person.joinedAt,
            count: yield* Random.nextIntBetween(0, 3),
          })
        }),
      { concurrency: 1 },
    )

    const organizationCounts = yield* Effect.forEach(
      context.organizations,
      (organization) =>
        Effect.gen(function* () {
          return yield* seedTimeline({
            profileId: organization.id,
            joinedAt: organization.createdAt,
            count: (yield* chance(0.8)) ? 1 : 0,
          })
        }),
      { concurrency: 1 },
    )

    return personaCount + sum(peopleCounts) + sum(organizationCounts)
  })
