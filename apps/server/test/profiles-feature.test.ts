import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import {
  Handle,
  PersonId,
  PersonProfileRow,
  ProfileVisibility,
  SessionContext,
  type ProfileRowUpdate,
} from "@gororobas/domain"
import {
  And,
  describeFeature,
  getBackgroundContext,
  Given,
  runSteps,
  Then,
  When,
} from "@gororobas/effect-bdd"
import { resolveSessionFromPersonId, VISITOR_SESSION } from "@gororobas/server/session-service"
import { Effect, Match, Option, Schema } from "effect"

import { ProfileService } from "../src/profiles/service.js"
import { seedPerson, TestLayerWithServices, withSession } from "./test-helpers.js"

const ProfileBackground = Schema.Struct({ actors: Schema.Record(Schema.String, PersonId) })
const NamedHandle = Schema.Struct({ name: Schema.String, handle: Handle })

const ProfileTable = Schema.Struct({
  name: Schema.String,
  table: Schema.Array(
    Schema.Union([
      Schema.Struct({ field: Schema.Literal("handle"), value: Handle }),
      Schema.Struct({ field: Schema.Literal("name"), value: PersonProfileRow.fields.name }),
      Schema.Struct({ field: Schema.Literal("bio"), value: Schema.String }),
      Schema.Struct({ field: Schema.Literal("location"), value: PersonProfileRow.fields.location }),
      Schema.Struct({ field: Schema.Literal("visibility"), value: ProfileVisibility }),
    ]),
  ),
})

const profileUpdateFrom = (table: typeof ProfileTable.Type.table) =>
  table.reduce<ProfileRowUpdate>(
    (update, row) =>
      Match.value(row).pipe(
        Match.when({ field: "handle" }, ({ value }) => ({ ...update, handle: value })),
        Match.when({ field: "name" }, ({ value }) => ({ ...update, name: value })),
        Match.when({ field: "location" }, ({ value }) => ({ ...update, location: value })),
        Match.when({ field: "visibility" }, ({ value }) => ({ ...update, visibility: value })),
        Match.when({ field: "bio" }, ({ value }): ProfileRowUpdate => ({
          ...update,
          bio:
            value === ""
              ? null
              : {
                  type: "doc",
                  version: 1,
                  content: [{ type: "paragraph", content: [{ type: "text", text: value }] }],
                },
        })),
        Match.exhaustive,
      ),
    {},
  )

const personNamed = (actors: typeof ProfileBackground.Type.actors, name: string) =>
  Option.getOrThrow(Option.fromNullishOr(actors[name]))

const givenHandle = () =>
  Given("{string:name} has handle {string:handle}", {
    params: NamedHandle,
    handler: (_, { name, handle }) =>
      Effect.gen(function* () {
        const { actors } = yield* getBackgroundContext(ProfileBackground)
        const personId = personNamed(actors, name)
        const service = yield* ProfileService
        yield* withSession(
          service.updateProfile(personId, { handle }),
          yield* resolveSessionFromPersonId(personId),
        )
        return { actors, personId }
      }),
  })

it.effect("impersonation isolates concurrent identities", () =>
  Effect.gen(function* () {
    const first = yield* seedPerson("COMMUNITY")
    const second = yield* seedPerson("COMMUNITY")
    const readIdentity = Effect.gen(function* () {
      yield* Effect.yieldNow
      return yield* SessionContext
    })

    const sessions = yield* Effect.all(
      [
        withSession(readIdentity, yield* resolveSessionFromPersonId(first.person.id)),
        withSession(readIdentity, yield* resolveSessionFromPersonId(second.person.id)),
      ],
      { concurrency: "unbounded" },
    )

    expect(sessions).toMatchObject([
      { type: "ACCOUNT", personId: first.person.id },
      { type: "ACCOUNT", personId: second.person.id },
    ])
  }).pipe(Effect.provide(TestLayerWithServices)),
)

it.effect("nested impersonation restores the caller's session", () =>
  Effect.gen(function* () {
    const first = yield* seedPerson("COMMUNITY")
    const second = yield* seedPerson("COMMUNITY")

    yield* withSession(
      Effect.gen(function* () {
        const before = yield* SessionContext
        const nested = yield* withSession(
          SessionContext,
          yield* resolveSessionFromPersonId(second.person.id),
        )
        const after = yield* SessionContext
        expect(nested.type === "ACCOUNT" ? nested.personId : null).toMatchObject(second.person.id)
        expect(after).toEqual(before)
      }),
      yield* resolveSessionFromPersonId(first.person.id),
    )

    expect(yield* SessionContext).toEqual(VISITOR_SESSION)
  }).pipe(Effect.provide(TestLayerWithServices), (action) => withSession(action, VISITOR_SESSION)),
)

it.effect("impersonation cannot edit another person's profile", () =>
  Effect.gen(function* () {
    const first = yield* seedPerson("COMMUNITY")
    const second = yield* seedPerson("COMMUNITY")
    const service = yield* ProfileService
    const before = yield* withSession(
      service.findById(first.person.id),
      yield* resolveSessionFromPersonId(first.person.id),
    )
    const error = yield* withSession(
      service.updateProfile(first.person.id, { name: "Unauthorized change" }),
      yield* resolveSessionFromPersonId(second.person.id),
    ).pipe(Effect.flip)
    expect(error).toMatchObject({ _tag: "UnauthorizedError" })

    expect(
      yield* withSession(
        service.findById(first.person.id),
        yield* resolveSessionFromPersonId(first.person.id),
      ),
    ).toEqual(before)
  }).pipe(Effect.provide(TestLayerWithServices)),
)

await Effect.runPromise(
  describeFeature("./people.feature", ({ Rule }) => {
    Rule("People can manage their profile", ({ Background, Scenario }) => {
      Background({
        layer: TestLayerWithServices,
        steps: () =>
          runSteps(
            Given("{string:name} has COMMUNITY access", {
              params: Schema.Struct({ name: Schema.String }),
              handler: (_, { name }) =>
                Effect.gen(function* () {
                  const { person } = yield* seedPerson("COMMUNITY")
                  const service = yield* ProfileService
                  yield* withSession(
                    service.updateProfile(person.id, { name }),
                    yield* resolveSessionFromPersonId(person.id),
                  )
                  return { actors: { [name]: person.id } }
                }),
            }),
          ),
      })

      Scenario("Person changes their handle", {
        layer: TestLayerWithServices,
        steps: () =>
          runSteps(
            givenHandle(),
            When("{string:name} changes their handle to {string:handle}", {
              params: NamedHandle,
              handler: (context, { name, handle }) =>
                Effect.gen(function* () {
                  const personId = personNamed(context.actors, name)
                  const service = yield* ProfileService
                  yield* withSession(
                    service.updateProfile(personId, { handle }),
                    yield* resolveSessionFromPersonId(personId),
                  )
                  return { ...context, personId }
                }),
            }),
            Then("their profile is accessible at {string:handle}", {
              params: Schema.Struct({ handle: Handle }),
              handler: (context, { handle }) =>
                Effect.gen(function* () {
                  const service = yield* ProfileService

                  const profile = Option.getOrThrow(
                    yield* withSession(
                      service.findByHandle(handle),
                      yield* resolveSessionFromPersonId(context.personId),
                    ),
                  )

                  expect(profile.id).toBe(context.personId)
                  expect(profile.handle).toBe(handle)
                  return context
                }),
            }),
            And("their old handle {string:handle} is no longer valid", {
              params: Schema.Struct({ handle: Handle }),
              handler: (context, { handle }) =>
                Effect.gen(function* () {
                  const service = yield* ProfileService

                  expect(
                    Option.isNone(
                      yield* withSession(
                        service.findByHandle(handle),
                        yield* resolveSessionFromPersonId(context.personId),
                      ),
                    ),
                  ).toBe(true)

                  return context
                }),
            }),
          ),
      })

      Scenario("Handle must be unique", {
        layer: TestLayerWithServices,
        steps: () =>
          runSteps(
            givenHandle(),
            And("someone has the handle {string:handle}", {
              params: Schema.Struct({ handle: Handle }),
              handler: (context, { handle }) =>
                Effect.gen(function* () {
                  const { person } = yield* seedPerson("COMMUNITY")
                  const service = yield* ProfileService
                  yield* withSession(
                    service.updateProfile(person.id, { handle }),
                    yield* resolveSessionFromPersonId(person.id),
                  )

                  const originalProfile = Option.getOrThrow(
                    yield* withSession(
                      service.findById(context.personId),
                      yield* resolveSessionFromPersonId(context.personId),
                    ),
                  )

                  return { ...context, originalProfile, otherPersonId: person.id }
                }),
            }),
            When("{string:name} tries to change their handle to {string:handle}", {
              params: NamedHandle,
              handler: (context, { name, handle }) =>
                Effect.gen(function* () {
                  const personId = personNamed(context.actors, name)
                  const service = yield* ProfileService
                  const error = yield* withSession(
                    service.updateProfile(personId, { handle }),
                    yield* resolveSessionFromPersonId(personId),
                  ).pipe(Effect.flip)
                  return { ...context, error, requestedHandle: handle }
                }),
            }),
            Then("the change fails because the handle is already in use", {
              handler: (context) =>
                Effect.gen(function* () {
                  expect(context.error).toMatchObject({
                    _tag: "HandleTakenError",
                    entity: "profile",
                    handle: context.requestedHandle,
                  })

                  const service = yield* ProfileService

                  const owner = Option.getOrThrow(
                    yield* withSession(
                      service.findByHandle(context.requestedHandle),
                      yield* resolveSessionFromPersonId(context.personId),
                    ),
                  )

                  expect(owner.id).toBe(context.otherPersonId)
                  return context
                }),
            }),
            And("{string:name}'s handle remains {string:handle}", {
              params: NamedHandle,
              handler: (context, { name, handle }) =>
                Effect.gen(function* () {
                  const personId = personNamed(context.actors, name)
                  const service = yield* ProfileService

                  const profile = Option.getOrThrow(
                    yield* withSession(
                      service.findById(personId),
                      yield* resolveSessionFromPersonId(personId),
                    ),
                  )

                  expect(profile.handle).toBe(handle)
                  expect(profile).toEqual(context.originalProfile)
                  return context
                }),
            }),
          ),
      })

      Scenario("Person sets up their profile", {
        layer: TestLayerWithServices,
        steps: () =>
          runSteps(
            When("{string:name} updates their profile with:", {
              params: ProfileTable,
              handler: (_, { name, table }) =>
                Effect.gen(function* () {
                  const { actors } = yield* getBackgroundContext(ProfileBackground)
                  const personId = personNamed(actors, name)
                  const information = profileUpdateFrom(table)
                  const service = yield* ProfileService
                  yield* withSession(
                    service.updateProfile(personId, information),
                    yield* resolveSessionFromPersonId(personId),
                  )
                  return { personId, information }
                }),
            }),
            Then("their profile shows the updated information", {
              handler: (context) =>
                Effect.gen(function* () {
                  const service = yield* ProfileService

                  const profile = Option.getOrThrow(
                    yield* withSession(
                      service.findById(context.personId),
                      yield* resolveSessionFromPersonId(context.personId),
                    ),
                  )

                  expect(profile).toMatchObject(context.information)
                  return context
                }),
            }),
          ),
      })
    })
  }).pipe(Effect.provide(NodeServices.layer)),
)
