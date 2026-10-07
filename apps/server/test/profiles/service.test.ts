import { describe, expect, it } from "@effect/vitest"
import { Handle, IdGen, PersonId, PlatformAccessLevel } from "@gororobas/domain"
import { resolveSessionFromPersonId, VISITOR_SESSION } from "@gororobas/server/session-service"
import { Effect, Option, Result, Schema } from "effect"

import { ProfileService } from "../../src/profiles/service.js"
import { seedPerson, TestLayerWithServices, withSession } from "../test-helpers.js"

const lookups = ["handle", "id"] as const

describe("ProfileService reads", () => {
  lookups.forEach((lookup) => {
    it.effect(`authorizes ${lookup} reads for each visibility and access level`, () =>
      Effect.gen(function* () {
        const { person } = yield* seedPerson("COMMUNITY")
        const service = yield* ProfileService
        const owner = yield* resolveSessionFromPersonId(person.id)
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
                        : yield* resolveSessionFromPersonId(
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
