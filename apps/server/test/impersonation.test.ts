import { expect, it } from "@effect/vitest"
import { SessionContext } from "@gororobas/domain"
import { resolveSessionFromAuthSubjectId, VISITOR_SESSION } from "@gororobas/server/session-service"
import { Effect } from "effect"

import { ProfileService } from "../src/profiles/service.js"
import { provisionAdministrator, provisionCommunityPerson } from "./feature-test-helpers.js"
import { TestLayerWithServices, withSession } from "./test-helpers.js"

it.effect("impersonation isolates concurrent identities", () =>
  Effect.gen(function* () {
    const administratorId = yield* provisionAdministrator()
    const firstPersonId = yield* provisionCommunityPerson(administratorId, "First person")
    const secondPersonId = yield* provisionCommunityPerson(administratorId, "Second person")
    const readIdentity = Effect.gen(function* () {
      yield* Effect.yieldNow
      return yield* SessionContext
    })

    const sessions = yield* Effect.all(
      [
        withSession(readIdentity, yield* resolveSessionFromAuthSubjectId(firstPersonId)),
        withSession(readIdentity, yield* resolveSessionFromAuthSubjectId(secondPersonId)),
      ],
      { concurrency: "unbounded" },
    )

    expect(sessions).toMatchObject([
      { type: "ACCOUNT", personId: firstPersonId },
      { type: "ACCOUNT", personId: secondPersonId },
    ])
  }).pipe(Effect.provide(TestLayerWithServices)),
)

it.effect("nested impersonation restores the caller's session", () =>
  Effect.gen(function* () {
    const administratorId = yield* provisionAdministrator()
    const firstPersonId = yield* provisionCommunityPerson(administratorId, "First person")
    const secondPersonId = yield* provisionCommunityPerson(administratorId, "Second person")

    yield* withSession(
      Effect.gen(function* () {
        const before = yield* SessionContext
        const nested = yield* withSession(
          SessionContext,
          yield* resolveSessionFromAuthSubjectId(secondPersonId),
        )
        const after = yield* SessionContext
        expect(nested).toMatchObject({ type: "ACCOUNT", personId: secondPersonId })
        expect(after).toEqual(before)
      }),
      yield* resolveSessionFromAuthSubjectId(firstPersonId),
    )

    expect(yield* SessionContext).toEqual(VISITOR_SESSION)
  }).pipe(Effect.provide(TestLayerWithServices), (action) => withSession(action, VISITOR_SESSION)),
)

it.effect("impersonation cannot edit another person's profile", () =>
  Effect.gen(function* () {
    const administratorId = yield* provisionAdministrator()
    const firstPersonId = yield* provisionCommunityPerson(administratorId, "First person")
    const secondPersonId = yield* provisionCommunityPerson(administratorId, "Second person")
    const service = yield* ProfileService
    const before = yield* withSession(
      service.findById(firstPersonId),
      yield* resolveSessionFromAuthSubjectId(firstPersonId),
    )
    const error = yield* withSession(
      service.updateProfile(firstPersonId, { name: "Unauthorized change" }),
      yield* resolveSessionFromAuthSubjectId(secondPersonId),
    ).pipe(Effect.flip)
    expect(error).toMatchObject({ _tag: "UnauthorizedError" })

    expect(
      yield* withSession(
        service.findById(firstPersonId),
        yield* resolveSessionFromAuthSubjectId(firstPersonId),
      ),
    ).toEqual(before)
  }).pipe(Effect.provide(TestLayerWithServices)),
)
