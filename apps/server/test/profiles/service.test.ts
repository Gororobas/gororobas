import { describe, expect, it } from "@effect/vitest"
import {
  Handle,
  IdGen,
  InformationVisibility,
  type PartialDate,
  PersonId,
  PlatformAccessLevel,
} from "@gororobas/domain"
import { resolveSessionFromAuthSubjectId, VISITOR_SESSION } from "@gororobas/server/session-service"
import { DateTime, Effect, Layer, Option, Result, Schema } from "effect"

import { PlacesService } from "../../src/places/service.js"
import { ProfileLocationsService } from "../../src/profiles/locations-service.js"
import { ProfilesRepository } from "../../src/profiles/repository.js"
import { ProfileService } from "../../src/profiles/service.js"
import { WikiArticlesRepository } from "../../src/wiki/repository.js"
import { seedPerson, TestLayerWithServices, withSession } from "../test-helpers.js"

const lookups = ["handle", "id"] as const

const ProfileLocationsTestLayer = Layer.effect(
  ProfileLocationsService,
  ProfileLocationsService.make,
).pipe(
  Layer.provideMerge(Layer.effect(PlacesService, PlacesService.make)),
  Layer.provideMerge(Layer.effect(WikiArticlesRepository, WikiArticlesRepository.make)),
)

describe("ProfileService reads", () => {
  it.effect("searches public profiles by their public latest location only", () =>
    Effect.gen(function* () {
      const { person: sharesPublicly } = yield* seedPerson("COMMUNITY")
      const { person: communityProfile } = yield* seedPerson("COMMUNITY")
      const { person: keepsPrivate } = yield* seedPerson("COMMUNITY")
      const { person: movedSincePublic } = yield* seedPerson("COMMUNITY")
      const repository = yield* ProfilesRepository
      const locations = yield* ProfileLocationsService
      const updatedAt = yield* DateTime.now

      const tropicalAndes = (
        visibility: InformationVisibility,
        endDate: Option.Option<PartialDate> = Option.none(),
      ) =>
        ({
          place: { _tag: "FreeText", text: "Tropical Andes" },
          startDate: Option.none(),
          endDate,
          visibility,
        }) as const

      yield* locations.add({
        profileId: sharesPublicly.id,
        payload: tropicalAndes("PUBLIC"),
        language: "pt",
      })

      yield* repository.updateProfileRow({
        id: communityProfile.id,
        visibility: "COMMUNITY",
        updatedAt,
      })

      yield* locations.add({
        profileId: communityProfile.id,
        payload: tropicalAndes("PUBLIC"),
        language: "pt",
      })

      yield* locations.add({
        profileId: keepsPrivate.id,
        payload: tropicalAndes("PRIVATE"),
        language: "pt",
      })

      // An older public entry stays unsearchable once a private one replaces it.
      yield* locations.add({
        profileId: movedSincePublic.id,
        payload: tropicalAndes(
          "PUBLIC",
          Option.some({ precision: "year", year: 2020, timezone: "UTC" }),
        ),
        language: "pt",
      })

      yield* locations.add({
        profileId: movedSincePublic.id,
        payload: {
          ...tropicalAndes("PRIVATE"),
          place: { _tag: "FreeText", text: "Somewhere else" },
        },
        language: "pt",
      })

      const profiles = yield* repository.searchProfiles({ text: "andes", language: "pt" })

      expect(profiles.map(({ id }) => id)).toEqual([sharesPublicly.id])
      expect(profiles[0]?.location).toEqual({ text: "Tropical Andes", placeHandle: null })
    }).pipe(
      Effect.provide(ProfileLocationsTestLayer.pipe(Layer.provideMerge(TestLayerWithServices))),
    ),
  )

  lookups.forEach((lookup) => {
    it.effect(`authorizes ${lookup} reads for each visibility and access level`, () =>
      Effect.gen(function* () {
        const { person } = yield* seedPerson("COMMUNITY")
        const service = yield* ProfileService
        const owner = yield* resolveSessionFromAuthSubjectId(person.id)
        const profile = Option.getOrThrow(yield* withSession(service.findById(person.id), owner))
        const read =
          lookup === "handle" ? service.findByHandle(profile.handle) : service.findById(person.id)

        yield* Effect.forEach(
          ["PUBLIC", "COMMUNITY"] as const,
          (visibility) =>
            Effect.gen(function* () {
              yield* withSession(service.updateProfile(person.id, { visibility }), owner)

              yield* Effect.forEach(
                [...PlatformAccessLevel.literals, "VISITOR"] as const,
                (accessLevel) =>
                  Effect.gen(function* () {
                    const session =
                      accessLevel === "VISITOR"
                        ? VISITOR_SESSION
                        : yield* resolveSessionFromAuthSubjectId(
                            (yield* seedPerson(accessLevel)).person.id,
                          )

                    const allowed =
                      visibility === "PUBLIC" ||
                      ["COMMUNITY", "MODERATOR", "ADMIN"].includes(accessLevel)
                    const result = yield* withSession(read, session).pipe(Effect.result)

                    const actual = Result.match(result, {
                      onFailure: (error) => ({ error: error._tag }),
                      onSuccess: (found) => {
                        const resultProfile = Option.getOrThrow(found)
                        return { id: resultProfile.id, visibility: resultProfile.visibility }
                      },
                    })

                    expect(actual).toEqual(
                      allowed ? { id: person.id, visibility } : { error: "UnauthorizedError" },
                    )
                  }),
                { concurrency: 1 },
              )
            }),
          { concurrency: 1 },
        )

        const nextHandle = yield* Schema.decodeEffect(Handle)("unused-profile")
        yield* withSession(service.updateProfile(person.id, { handle: nextHandle }), owner)
        const missingRead =
          lookup === "handle"
            ? service.findByHandle(profile.handle)
            : service.findById(yield* IdGen.make(PersonId))
        expect(Option.isNone(yield* withSession(missingRead, VISITOR_SESSION))).toBe(true)
      }).pipe(Effect.provide(TestLayerWithServices)),
    )
  })
})
