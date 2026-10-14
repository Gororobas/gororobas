import {
  OnboardingInput,
  PersonId,
  PersonProfileRow,
  ProfileAlreadyExistsError,
  SignInRequiredError,
  stringToHandle,
} from "@gororobas/domain"
import { Auth } from "@yielded/auth"
import { DateTime, Effect, Option, Random } from "effect"
import { SqlClient } from "effect/sql"

import { AppAuth } from "../authentication/app-auth.js"
import { ProfilesRepository } from "../profiles/repository.js"
import { PeopleRepository } from "./repository.js"

/**
 * Accounts exist before their people: signing up only proves an email, so
 * handlers that serve onboarding read the signed-in account rather than `SessionContext`.
 */
export const currentAuthSubjectPersonId = Effect.gen(function* () {
  const request = yield* Effect.serviceOption(Auth.AuthRequest)
  if (Option.isNone(request)) return yield* new SignInRequiredError()

  const session = yield* (yield* AppAuth)
    .getSession()
    .pipe(Effect.provideService(Auth.AuthRequest, request.value), Effect.orDie)
  if (session === null) return yield* new SignInRequiredError()

  return PersonId.make(session.subjectId)
})

const FALLBACK_HANDLE_BASE = "pessoa"

const availableHandle = Effect.fn("People.availableHandle")(function* (name: string) {
  const repository = yield* ProfilesRepository
  // The EXISTS query always returns a row.
  const isHandleInUse = (handle: string) =>
    repository.isHandleInUse(handle).pipe(Effect.catchTag("NoSuchElementError", Effect.die))
  const base = yield* stringToHandle(name).pipe(Effect.orElseSucceed(() => FALLBACK_HANDLE_BASE))

  if (!(yield* isHandleInUse(base))) return yield* stringToHandle(base)

  // A random suffix keeps the name readable without guessing how many namesakes exist.
  const suffixed = Effect.gen(function* () {
    const suffix = yield* Random.nextIntBetween(1000, 9999)
    const handle = yield* stringToHandle(`${base}-${suffix}`)
    return { handle, isInUse: yield* isHandleInUse(handle) }
  })

  const available = yield* suffixed.pipe(Effect.repeat({ until: ({ isInUse }) => !isInUse }))
  return available.handle
})

export const completeOnboarding = Effect.fn("People.completeOnboarding")(function* (
  id: PersonId,
  input: OnboardingInput,
) {
  const sql = yield* SqlClient.SqlClient
  const profiles = yield* ProfilesRepository
  const people = yield* PeopleRepository

  return yield* sql.withTransaction(
    Effect.gen(function* () {
      if (Option.isSome(yield* profiles.findById(id))) {
        return yield* new ProfileAlreadyExistsError({ id })
      }

      const now = yield* DateTime.now

      const profile = PersonProfileRow.make({
        id,
        type: "PERSON",
        handle: yield* availableHandle(input.name),
        name: input.name,
        bio: null,
        location: null,
        photoId: null,
        visibility: "PUBLIC",
        createdAt: now,
        updatedAt: now,
      })

      yield* profiles.insertProfile(profile)

      yield* people.insertRow({
        id,
        accessLevel: "NEWCOMER",
        accessSetAt: null,
        accessSetById: null,
      })

      return profile
    }),
  )
})
