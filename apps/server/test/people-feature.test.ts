import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import {
  Handle,
  PersonId,
  PersonRow,
  PlatformAccessLevel,
  ProfileVisibility,
  PublicationId,
  CommentId,
  NameInCrdtList,
  WikiArticleId,
  WikiArticleRevisionRow,
  OrganizationAccessLevel,
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
import { resolveSessionFromAuthSubjectId, VISITOR_SESSION } from "@gororobas/server/session-service"
import { Effect, Option, Result, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import { CommentsRepository } from "../src/comments/repository.js"
import { CommentsService } from "../src/comments/service.js"
import { OrganizationsRepository } from "../src/organizations/repository.js"
import { PeopleRepository } from "../src/people/repository.js"
import { PeopleService } from "../src/people/service.js"
import { ProfileService } from "../src/profiles/service.js"
import { PublicationsRepository } from "../src/publications/repository.js"
import { PublicationsService } from "../src/publications/service.js"
import { findDatabaseRowById } from "../src/wiki/queries.js"
import { WikiArticlesRepository } from "../src/wiki/repository.js"
import {
  PeopleBackground,
  NamedHandle,
  ProfileTestDataTable,
  profileUpdateFromTestDataTable,
  personNamed,
  provisionPerson,
  provisionCommunityPerson,
  provisionAdministrator,
  PeopleTestDataTable,
  provisionPeople,
  withPerson,
  PeopleFeatureTestLayer,
  textToRichTextDocument,
  createPost,
  createOrganization,
} from "./feature-test-helpers.js"
import { makeMembershipFixture } from "./fixtures.js"
import { TestLayerWithServices, withSession } from "./test-helpers.js"

const accessLevelForPerson = (personId: PersonId) =>
  resolveSessionFromAuthSubjectId(personId).pipe(
    Effect.map((session) => (session.type === "ACCOUNT" ? session.accessLevel : "VISITOR")),
  )

const givenHandle = () =>
  Given("{string:name} has handle {string:handle}", {
    params: NamedHandle,
    handler: (_, { name, handle }) =>
      Effect.gen(function* () {
        const context = yield* getBackgroundContext(PeopleBackground)
        const { actors } = context
        const personId = personNamed(actors, name)
        const service = yield* ProfileService
        yield* withSession(
          service.updateProfile(personId, { handle }),
          yield* resolveSessionFromAuthSubjectId(personId),
        )
        return { ...context, personId }
      }),
  })

it.effect("provisioned newcomers need approval to read community profiles", () =>
  Effect.gen(function* () {
    const administratorId = yield* provisionAdministrator()
    const ownerId = yield* provisionCommunityPerson(administratorId, "Profile owner")
    const profiles = yield* ProfileService
    yield* withSession(
      profiles.updateProfile(ownerId, { visibility: "COMMUNITY" }),
      yield* resolveSessionFromAuthSubjectId(ownerId),
    )

    const newcomerId = yield* provisionPerson("Newcomer")
    const newcomerSession = yield* resolveSessionFromAuthSubjectId(newcomerId)
    expect(newcomerSession.type === "ACCOUNT" ? newcomerSession.accessLevel : "VISITOR").toBe(
      "NEWCOMER",
    )
    const denied = yield* withSession(profiles.findById(ownerId), newcomerSession).pipe(Effect.flip)
    expect(denied).toMatchObject({ _tag: "UnauthorizedError" })

    const people = yield* PeopleService
    yield* withSession(
      people.setAccessLevel(newcomerId, "COMMUNITY"),
      yield* resolveSessionFromAuthSubjectId(administratorId),
    )

    const profile = Option.getOrThrow(
      yield* withSession(
        profiles.findById(ownerId),
        yield* resolveSessionFromAuthSubjectId(newcomerId),
      ),
    )

    expect(profile.id).toBe(ownerId)
  }).pipe(Effect.provide(TestLayerWithServices)),
)

const NamedPerson = Schema.Struct({ name: Schema.String })
const NamedAccessLevel = Schema.Struct({ name: Schema.String, accessLevel: PlatformAccessLevel })

const AccessChange = Schema.Struct({
  actor: Schema.String,
  target: Schema.String,
  accessLevel: PlatformAccessLevel,
})

const givenPeople = () =>
  Given("the following people exist:", {
    params: PeopleTestDataTable,
    handler: (_, { table }) => provisionPeople(table),
  })

const setAccess = ({
  actorId,
  personId,
  accessLevel,
}: {
  actorId: PersonId
  personId: PersonId
  accessLevel: PlatformAccessLevel
}) =>
  PeopleService.use((people) => withPerson(people.setAccessLevel(personId, accessLevel), actorId))

const changeAccess = () =>
  When("{string:actor} {word:verb} {string:target} to {word:accessLevel}", {
    params: Schema.Struct({
      ...AccessChange.fields,
      verb: Schema.Literals(["promotes", "demotes"]),
    }),
    handler: (_, { actor, target, accessLevel }) =>
      Effect.gen(function* () {
        const context = yield* getBackgroundContext(PeopleBackground)
        const actorId = personNamed(context.actors, actor)
        const personId = personNamed(context.actors, target)
        yield* setAccess({ actorId, personId, accessLevel: accessLevel })
        const people = yield* PeopleRepository
        const person = Option.getOrThrow(yield* people.findById(personId))
        expect(person.accessSetById).toBe(actorId)
        expect(person.accessSetAt).not.toBeNull()
        return context
      }),
  })

const deniedAccessChange = () =>
  When("{string:actor} tries to promote {string:target} to {word:accessLevel}", {
    params: AccessChange,
    handler: (_, { actor, target, accessLevel }) =>
      Effect.gen(function* () {
        const context = yield* getBackgroundContext(PeopleBackground)
        const personId = personNamed(context.actors, target)
        const people = yield* PeopleRepository
        const before = yield* people.findById(personId)

        const error = yield* setAccess({
          actorId: personNamed(context.actors, actor),
          personId,
          accessLevel,
        }).pipe(Effect.flip)

        return { ...context, personId, before, error }
      }),
  })

const accessDenied = () =>
  Then("access is denied", {
    handler: (context: { error: unknown; personId: PersonId; before: Option.Option<PersonRow> }) =>
      Effect.gen(function* () {
        expect(context.error).toMatchObject({ _tag: "UnauthorizedError" })
        const people = yield* PeopleRepository
        expect(yield* people.findById(context.personId)).toEqual(context.before)
        return context
      }),
  })

const blockAccess = () =>
  When("{string:actor} blocks {string:target}'s access", {
    params: Schema.Struct({ actor: Schema.String, target: Schema.String }),
    handler: (_, { actor, target }) =>
      Effect.gen(function* () {
        const context = yield* getBackgroundContext(PeopleBackground)

        yield* setAccess({
          actorId: personNamed(context.actors, actor),
          personId: personNamed(context.actors, target),
          accessLevel: "BLOCKED",
        })

        return context
      }),
  })

const verifyAccessLevel = (name: string, accessLevel: PlatformAccessLevel) =>
  Effect.gen(function* () {
    const context = yield* getBackgroundContext(PeopleBackground)
    expect(yield* accessLevelForPerson(personNamed(context.actors, name))).toBe(accessLevel)
    return context
  })

const communityAccessBecomes = () =>
  Then("{string:name} becomes a member with community access", {
    params: NamedPerson,
    handler: (_, { name }) => verifyAccessLevel(name, "COMMUNITY"),
  })

const blockedAccessBecomes = () =>
  Then("{string:name} becomes blocked", {
    params: NamedPerson,
    handler: (_, { name }) => verifyAccessLevel(name, "BLOCKED"),
  })

const accessLevelBecomes = () =>
  Then("{string:name}'s accessLevel becomes {string:accessLevel}", {
    params: NamedAccessLevel,
    handler: (_, { name, accessLevel }) => verifyAccessLevel(name, accessLevel),
  })

const readWikiHistory = SqlSchema.findAll({
  Request: WikiArticleId,
  Result: WikiArticleRevisionRow,
  execute: (wikiArticleId) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`SELECT * FROM wiki_article_revisions WHERE wiki_article_id = ${wikiArticleId} ORDER BY created_at, id`,
    ),
})

const DeletionBackground = Schema.Struct({
  ...PeopleBackground.fields,
  personId: PersonId,
  publicationId: PublicationId,
  retainedPublicationId: PublicationId,
  commentId: CommentId,
})

const confirmPersonalDeletion = (personId: PersonId, shouldDeleteOrgs = false) =>
  PeopleService.use((people) =>
    withPerson(
      people.deleteCurrentPerson({ shouldDeleteContent: true, shouldDeleteOrgs }),
      personId,
    ),
  )

const expectPersonDeleted = (personId: PersonId) =>
  Effect.gen(function* () {
    const profiles = yield* ProfileService
    const people = yield* PeopleRepository
    expect(Option.isNone(yield* withSession(profiles.findById(personId), VISITOR_SESSION))).toBe(
      true,
    )
    expect(Option.isNone(yield* people.findById(personId))).toBe(true)
    expect(yield* resolveSessionFromAuthSubjectId(personId)).toEqual(VISITOR_SESSION)
  })

const NamedOrganization = Schema.Struct({ name: Schema.String, organization: Schema.String })

const provisionManagedOrganization = ({ name, organization }: typeof NamedOrganization.Type) =>
  Effect.gen(function* () {
    const context = yield* getBackgroundContext(DeletionBackground)
    const managerId = personNamed(context.actors, name)
    const organizationId = yield* createOrganization(organization, managerId)

    const organizationPublication = yield* createPost({
      personId: managerId,
      ownerProfileId: organizationId,
      content: "Conteúdo da organização",
    })

    return { ...context, organizationId, organizationPublication }
  })

const givenOnlyManagerOrganization = () =>
  Given("{string:name} is the only MANAGER of {string:organization}", {
    params: NamedOrganization,
    handler: (_, params) => provisionManagedOrganization(params),
  })

const givenSoleMemberOrganization = () =>
  Given("{string:name} is the only member and MANAGER of {string:organization}", {
    params: NamedOrganization,
    handler: (_, params) => provisionManagedOrganization(params),
  })

it.effect("administrator demotion preserves at least one administrator", () =>
  Effect.gen(function* () {
    const administratorId = yield* provisionAdministrator()
    const otherAdministratorId = yield* provisionPerson("Another administrator")
    const people = yield* PeopleRepository

    yield* Effect.forEach(
      ["COMMUNITY", "MODERATOR", "BLOCKED"] as const,
      (accessLevel) =>
        Effect.gen(function* () {
          const before = yield* people.findById(administratorId)

          expect(
            yield* setAccess({
              actorId: administratorId,
              personId: administratorId,
              accessLevel,
            }).pipe(Effect.flip),
          ).toMatchObject({ _tag: "UnauthorizedError" })

          expect(yield* people.findById(administratorId)).toEqual(before)

          yield* setAccess({
            actorId: administratorId,
            personId: otherAdministratorId,
            accessLevel: "ADMIN",
          })

          yield* setAccess({
            actorId: otherAdministratorId,
            personId: administratorId,
            accessLevel,
          })

          expect(Option.getOrThrow(yield* people.findById(administratorId)).accessLevel).toBe(
            accessLevel,
          )

          yield* setAccess({
            actorId: otherAdministratorId,
            personId: administratorId,
            accessLevel: "ADMIN",
          })

          yield* setAccess({
            actorId: administratorId,
            personId: otherAdministratorId,
            accessLevel: "COMMUNITY",
          })
        }),
      { concurrency: 1 },
    )
  }).pipe(Effect.provide(TestLayerWithServices)),
)

await Effect.runPromise(
  describeFeature("./people.feature", ({ Rule, Scenario }) => {
    Scenario("Newcomers start without access to community content", {
      layer: PeopleFeatureTestLayer,
      steps: () =>
        runSteps(
          Given("{string:name} has COMMUNITY access", {
            params: NamedPerson,
            handler: (_, { name }) =>
              Effect.gen(function* () {
                const administratorId = yield* provisionAdministrator()
                const personId = yield* provisionCommunityPerson(administratorId, name)
                return { administratorId, actors: { [name]: personId } }
              }),
          }),
          And("{string:name} has a {string:visibility} profile", {
            params: Schema.Struct({ name: Schema.String, visibility: ProfileVisibility }),
            handler: (context, { name, visibility }) =>
              Effect.gen(function* () {
                const personId = personNamed(context.actors, name)
                const profiles = yield* ProfileService
                yield* withPerson(profiles.updateProfile(personId, { visibility }), personId)
                return context
              }),
          }),
          And(
            "{string:name} has created a {string:visibility} post with content {string:content}",
            {
              params: Schema.Struct({
                name: Schema.String,
                visibility: ProfileVisibility,
                content: Schema.String,
              }),
              handler: (context, { name, visibility, content }) =>
                Effect.gen(function* () {
                  const personId = personNamed(context.actors, name)

                  const publication = yield* createPost({
                    personId,
                    ownerProfileId: personId,
                    content,
                    visibility,
                  })

                  return { ...context, publication }
                }),
            },
          ),
          When("{string:name} completes signup", {
            params: NamedPerson,
            handler: (context, { name }) =>
              Effect.gen(function* () {
                const newcomerId = yield* provisionPerson(name)
                return { ...context, actors: { ...context.actors, [name]: newcomerId } }
              }),
          }),
          Then("{string:name}'s accessLevel becomes {string:accessLevel}", {
            params: NamedAccessLevel,
            handler: (context, { name, accessLevel }) =>
              Effect.gen(function* () {
                expect(yield* accessLevelForPerson(personNamed(context.actors, name))).toBe(
                  accessLevel,
                )
                return context
              }),
          }),
          And("{string:name} cannot access {string:owner}'s profile", {
            params: Schema.Struct({ name: Schema.String, owner: Schema.String }),
            handler: (context, { name, owner }) =>
              Effect.gen(function* () {
                const profiles = yield* ProfileService
                const error = yield* withPerson(
                  profiles.findById(personNamed(context.actors, owner)),
                  personNamed(context.actors, name),
                ).pipe(Effect.flip)
                expect(error).toMatchObject({ _tag: "UnauthorizedError" })
                return context
              }),
          }),
          And("{string:name} cannot access the post publication", {
            params: NamedPerson,
            handler: (context, { name }) =>
              Effect.gen(function* () {
                const publications = yield* PublicationsService
                const error = yield* withPerson(
                  publications.getPublicationPageData(context.publication.handle),
                  personNamed(context.actors, name),
                ).pipe(Effect.flip)
                expect(error).toMatchObject({ _tag: "UnauthorizedError" })
                return context
              }),
          }),
        ),
    })

    Rule("People can set their profile visibility", ({ Background, Scenario }) => {
      Background({ layer: PeopleFeatureTestLayer, steps: () => runSteps(givenPeople()) })

      const visibilitySteps = () =>
        runSteps(
          When("{string:name} has set their profile visibility to {string:visibility}", {
            params: Schema.Struct({ name: Schema.String, visibility: ProfileVisibility }),
            handler: (_, { name, visibility }) =>
              Effect.gen(function* () {
                const context = yield* getBackgroundContext(PeopleBackground)
                const personId = personNamed(context.actors, name)
                const profiles = yield* ProfileService
                yield* withPerson(profiles.updateProfile(personId, { visibility }), personId)
                return { ...context, personId }
              }),
          }),
          Then("{string:name}'s profile should have the following accessibility:", {
            params: Schema.Struct({
              name: Schema.String,
              table: Schema.Array(
                Schema.Struct({
                  viewer: Schema.String,
                  can_access: Schema.Literals(["yes", "no"]),
                }),
              ),
            }),
            handler: (context, { name, table }) =>
              Effect.gen(function* () {
                const profiles = yield* ProfileService
                const personId = personNamed(context.actors, name)
                const ownerProfile = Option.getOrThrow(
                  yield* withPerson(profiles.findById(personId), personId),
                )

                yield* Effect.forEach(
                  table,
                  ({ viewer, can_access: canAccess }) =>
                    Effect.gen(function* () {
                      const session =
                        viewer === "visitors"
                          ? VISITOR_SESSION
                          : yield* resolveSessionFromAuthSubjectId(
                              personNamed(context.actors, viewer),
                            )

                      yield* Effect.forEach(
                        [profiles.findById(personId), profiles.findByHandle(ownerProfile.handle)],
                        (read) =>
                          Effect.gen(function* () {
                            const result = yield* withSession(read, session).pipe(Effect.result)
                            expect(Result.isSuccess(result)).toBe(canAccess === "yes")

                            Result.match(result, {
                              onSuccess: (profile) =>
                                expect(Option.getOrThrow(profile).id).toBe(personId),
                              onFailure: (error) =>
                                expect(error).toMatchObject({ _tag: "UnauthorizedError" }),
                            })
                          }),
                        { concurrency: 1 },
                      )
                    }),
                  { concurrency: 1 },
                )

                return context
              }),
          }),
        )

      Scenario("Person sets profile to public", {
        layer: PeopleFeatureTestLayer,
        steps: visibilitySteps,
      })
      Scenario("Person sets profile to community-only", {
        layer: PeopleFeatureTestLayer,
        steps: visibilitySteps,
      })
    })

    Rule("Moderators and admins manage community access", ({ Background, Scenario }) => {
      Background({ layer: PeopleFeatureTestLayer, steps: () => runSteps(givenPeople()) })

      Scenario("Admin allows a person awaiting access", {
        layer: PeopleFeatureTestLayer,
        steps: () => runSteps(changeAccess(), communityAccessBecomes()),
      })

      Scenario("Moderator allows a person awaiting access", {
        layer: PeopleFeatureTestLayer,
        steps: () => runSteps(changeAccess(), communityAccessBecomes()),
      })

      Scenario("Member with community access cannot allow people", {
        layer: PeopleFeatureTestLayer,
        steps: () => runSteps(deniedAccessChange(), accessDenied()),
      })

      Scenario("Admin blocks a person from accessing community content", {
        layer: PeopleFeatureTestLayer,
        steps: () =>
          runSteps(
            Given("{string:name} has been promoted to COMMUNITY", {
              params: NamedPerson,
              handler: (_, { name }) =>
                Effect.gen(function* () {
                  const context = yield* getBackgroundContext(PeopleBackground)

                  yield* setAccess({
                    actorId: context.administratorId,
                    personId: personNamed(context.actors, name),
                    accessLevel: "COMMUNITY",
                  })

                  return context
                }),
            }),
            blockAccess(),
            blockedAccessBecomes(),
          ),
      })

      Scenario("Admin blocks and demotes a MODERATOR", {
        layer: PeopleFeatureTestLayer,
        steps: () => runSteps(blockAccess(), blockedAccessBecomes()),
      })
    })

    Rule("Admins manage people access levels", ({ Background, Scenario }) => {
      Background({ layer: PeopleFeatureTestLayer, steps: () => runSteps(givenPeople()) })

      Scenario("Admin promotes member with community access to MODERATOR", {
        layer: PeopleFeatureTestLayer,
        steps: () => runSteps(changeAccess(), accessLevelBecomes()),
      })

      Scenario("Admin promotes MODERATOR to ADMIN", {
        layer: PeopleFeatureTestLayer,
        steps: () => runSteps(changeAccess(), accessLevelBecomes()),
      })

      Scenario("Admin demotes MODERATOR to COMMUNITY", {
        layer: PeopleFeatureTestLayer,
        steps: () => runSteps(changeAccess(), accessLevelBecomes()),
      })

      Scenario("MODERATOR cannot change access levels", {
        layer: PeopleFeatureTestLayer,
        steps: () => runSteps(deniedAccessChange(), accessDenied()),
      })

      Scenario("Cannot demote the last ADMIN", {
        layer: PeopleFeatureTestLayer,
        steps: () =>
          runSteps(
            Given("{string:name} is the only ADMIN", {
              params: NamedPerson,
              handler: (_, { name }) =>
                Effect.gen(function* () {
                  const context = yield* getBackgroundContext(PeopleBackground)
                  const people = yield* PeopleRepository
                  const personId = personNamed(context.actors, name)
                  expect(yield* people.countOtherAdministrators(personId)).toEqual({ count: 0 })
                  return context
                }),
            }),
            When("{string:name} tries to demote themselves", {
              params: NamedPerson,
              handler: (context, { name }) =>
                Effect.gen(function* () {
                  const personId = personNamed(context.actors, name)
                  const people = yield* PeopleRepository
                  const before = yield* people.findById(personId)

                  const error = yield* setAccess({
                    actorId: personId,
                    personId,
                    accessLevel: "COMMUNITY",
                  }).pipe(Effect.flip)

                  return { ...context, personId, before, error }
                }),
            }),
            accessDenied(),
          ),
      })
    })

    Rule("People can manage their profile", ({ Background, Scenario }) => {
      Background({
        layer: TestLayerWithServices,
        steps: () =>
          runSteps(
            Given("{string:name} has COMMUNITY access", {
              params: Schema.Struct({ name: Schema.String }),
              handler: (_, { name }) =>
                Effect.gen(function* () {
                  // The first administrator is the only trusted fixture; feature actors follow production provisioning and approval.
                  const administratorId = yield* provisionAdministrator()
                  const personId = yield* provisionCommunityPerson(administratorId, name)
                  return { administratorId, actors: { [name]: personId } }
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
                    yield* resolveSessionFromAuthSubjectId(personId),
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
                      yield* resolveSessionFromAuthSubjectId(context.personId),
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
                        yield* resolveSessionFromAuthSubjectId(context.personId),
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
                  const otherPersonId = yield* provisionCommunityPerson(
                    context.administratorId,
                    "Another person",
                  )
                  const service = yield* ProfileService
                  yield* withSession(
                    service.updateProfile(otherPersonId, { handle }),
                    yield* resolveSessionFromAuthSubjectId(otherPersonId),
                  )

                  const originalProfile = Option.getOrThrow(
                    yield* withSession(
                      service.findById(context.personId),
                      yield* resolveSessionFromAuthSubjectId(context.personId),
                    ),
                  )

                  return { ...context, originalProfile, otherPersonId }
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
                    yield* resolveSessionFromAuthSubjectId(personId),
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
                      yield* resolveSessionFromAuthSubjectId(context.personId),
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
                      yield* resolveSessionFromAuthSubjectId(personId),
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
              params: ProfileTestDataTable,
              handler: (_, { name, table }) =>
                Effect.gen(function* () {
                  const { actors } = yield* getBackgroundContext(PeopleBackground)
                  const personId = personNamed(actors, name)
                  const information = profileUpdateFromTestDataTable(table)
                  const service = yield* ProfileService
                  yield* withSession(
                    service.updateProfile(personId, information),
                    yield* resolveSessionFromAuthSubjectId(personId),
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
                      yield* resolveSessionFromAuthSubjectId(context.personId),
                    ),
                  )

                  expect(profile).toMatchObject(context.information)
                  return context
                }),
            }),
          ),
      })
    })

    Rule("People can delete their account", ({ Background, Scenario }) => {
      Background({
        layer: PeopleFeatureTestLayer,
        steps: () =>
          runSteps(
            Given("the following people exist:", {
              params: PeopleTestDataTable,
              handler: (_, { table }) =>
                Effect.gen(function* () {
                  const context = yield* provisionPeople(table)
                  const personId = personNamed(context.actors, "Maria")

                  const publication = yield* createPost({
                    personId,
                    ownerProfileId: personId,
                    content: "Conteúdo pessoal",
                  })

                  const retainedPublication = yield* createPost({
                    personId: context.administratorId,
                    ownerProfileId: context.administratorId,
                    content: "Conteúdo de outra pessoa",
                  })

                  const comments = yield* CommentsService

                  const commentId = yield* withPerson(
                    comments.createPublicationComment({
                      publicationId: retainedPublication.id,
                      content: {
                        locales: {
                          pt: {
                            content: textToRichTextDocument("Comentário pessoal"),
                            originalLocale: "pt",
                            translatedAtCrdtFrontier: null,
                            translationSource: "ORIGINAL",
                          },
                        },
                      },
                    }),
                    personId,
                  )

                  return {
                    ...context,
                    personId,
                    publicationId: publication.id,
                    retainedPublicationId: retainedPublication.id,
                    commentId,
                  }
                }),
            }),
          ),
      })

      Scenario("Person deletes their account", {
        layer: PeopleFeatureTestLayer,
        steps: () =>
          runSteps(
            When("{string:name} confirms deletion of their account and personal content", {
              params: NamedPerson,
              handler: (_, { name }) =>
                Effect.gen(function* () {
                  const context = yield* getBackgroundContext(DeletionBackground)
                  const personId = personNamed(context.actors, name)
                  const people = yield* PeopleService
                  const confirmation = yield* withPerson(people.deleteCurrentPerson(), personId)
                  expect(confirmation).toMatchObject({
                    _tag: "ConfirmContentDeletion",
                    personalContentCount: { posts: 1, comments: 1 },
                  })
                  const profiles = yield* ProfileService
                  expect(
                    Option.isSome(yield* withPerson(profiles.findById(personId), personId)),
                  ).toBe(true)
                  expect(yield* confirmPersonalDeletion(personId)).toEqual({ _tag: "Success" })
                  return context
                }),
            }),
            Then("{string:name}'s profile no longer exists", {
              params: NamedPerson,
              handler: (context, { name }) =>
                expectPersonDeleted(personNamed(context.actors, name)).pipe(Effect.as(context)),
            }),
            And("{string:name}'s personal publications are deleted", {
              params: NamedPerson,
              handler: (context) =>
                Effect.gen(function* () {
                  const publications = yield* PublicationsRepository

                  expect(
                    Option.isNone(
                      yield* publications.findPublicationRowById(context.publicationId),
                    ),
                  ).toBe(true)

                  expect(
                    Option.isSome(
                      yield* publications.findPublicationRowById(context.retainedPublicationId),
                    ),
                  ).toBe(true)

                  return context
                }),
            }),
            And("{string:name}'s comments are deleted", {
              params: NamedPerson,
              handler: (context) =>
                Effect.gen(function* () {
                  const comments = yield* CommentsRepository
                  expect(Option.isNone(yield* comments.findCommentRowById(context.commentId))).toBe(
                    true,
                  )
                  return context
                }),
            }),
          ),
      })

      Scenario("Deleted person's wiki contributions remain but are anonymized", {
        layer: PeopleFeatureTestLayer,
        steps: () =>
          runSteps(
            Given("{string:name} has approved revisions on wiki article {string:title}", {
              params: Schema.Struct({ name: Schema.String, title: Schema.String }),
              handler: (_, { name, title }) =>
                Effect.gen(function* () {
                  const context = yield* getBackgroundContext(DeletionBackground)
                  const wiki = yield* WikiArticlesRepository

                  const wikiArticleId = yield* wiki
                    .createWikiArticle(
                      {
                        createdById: personNamed(context.actors, name),
                        status: "PUBLISHED",
                        wikiArticle: {
                          kind: "UNCATEGORIZED",
                          attributes: { suggestedKind: Option.none() },
                          translations: {
                            pt: {
                              commonNames: [
                                yield* Schema.decodeEffect(NameInCrdtList)({
                                  value: title,
                                  id: "mandioca0001",
                                }),
                              ],
                              content: Option.some(textToRichTextDocument("Cultivo da mandioca")),
                              grammaticalGender: Option.none(),
                            },
                          },
                        },
                      },
                      { enrichment: "skip" },
                    )
                    .pipe(Effect.provide(WorkflowEngine.layerMemory))

                  const history = yield* readWikiHistory(wikiArticleId)
                  expect(history).toHaveLength(1)
                  expect(history[0]).toMatchObject({
                    evaluation: "APPROVED",
                    createdById: context.personId,
                  })
                  const article = yield* findDatabaseRowById(wikiArticleId)
                  return { ...context, wikiArticleId, history, article }
                }),
            }),
            When("{string:name} confirms deletion of their account and personal content", {
              params: NamedPerson,
              handler: (context, { name }) =>
                Effect.gen(function* () {
                  expect(yield* confirmPersonalDeletion(personNamed(context.actors, name))).toEqual(
                    { _tag: "Success" },
                  )
                  return context
                }),
            }),
            Then(
              "{string:title} revision history remains the same but no longer shows {string:name}",
              {
                params: Schema.Struct({ title: Schema.String, name: Schema.String }),
                handler: (context) =>
                  Effect.gen(function* () {
                    expect(yield* readWikiHistory(context.wikiArticleId)).toEqual(
                      context.history.map((revision) => ({
                        ...revision,
                        createdById: null,
                        evaluatedById: Option.none(),
                      })),
                    )

                    expect(yield* findDatabaseRowById(context.wikiArticleId)).toEqual(
                      context.article,
                    )
                    yield* expectPersonDeleted(context.personId)
                    return context
                  }),
              },
            ),
          ),
      })

      Scenario("Cannot delete account as sole MANAGER when other organization members remain", {
        layer: PeopleFeatureTestLayer,
        steps: () =>
          runSteps(
            givenOnlyManagerOrganization(),
            And("{string:organization} has other members", {
              params: Schema.Struct({ organization: Schema.String }),
              handler: (context) =>
                Effect.gen(function* () {
                  const organizations = yield* OrganizationsRepository

                  yield* organizations.insertMembership(
                    yield* makeMembershipFixture({
                      organizationId: context.organizationId,
                      personId: context.administratorId,
                      accessLevel: "VIEWER",
                    }),
                  )

                  const profiles = yield* ProfileService
                  const profileBefore = yield* withPerson(
                    profiles.findById(context.personId),
                    context.personId,
                  )
                  const membersBefore = yield* organizations.listMembers(context.organizationId)
                  return { ...context, profileBefore, membersBefore }
                }),
            }),
            When("{string:name} tries to delete their account", {
              params: NamedPerson,
              handler: (context, { name }) =>
                Effect.gen(function* () {
                  const error = yield* confirmPersonalDeletion(
                    personNamed(context.actors, name),
                    true,
                  ).pipe(Effect.flip)
                  return { ...context, error }
                }),
            }),
            Then(
              "account deletion fails because {string:organization} would have members without a manager",
              {
                params: Schema.Struct({ organization: Schema.String }),
                handler: (context) =>
                  Effect.sync(() => {
                    expect(context.error).toMatchObject({
                      _tag: "AccountDeletionError",
                      reason: { _tag: "SoleOrgManager", organizations: [context.organizationId] },
                    })
                    return context
                  }),
              },
            ),
            And("{string:name}'s account and organization membership remain unchanged", {
              params: NamedPerson,
              handler: (context) =>
                Effect.gen(function* () {
                  const profiles = yield* ProfileService
                  const organizations = yield* OrganizationsRepository
                  const publications = yield* PublicationsRepository
                  const comments = yield* CommentsRepository
                  expect(
                    yield* withPerson(profiles.findById(context.personId), context.personId),
                  ).toEqual(context.profileBefore)
                  expect(yield* organizations.listMembers(context.organizationId)).toEqual(
                    context.membersBefore,
                  )

                  expect(
                    Option.isSome(
                      yield* publications.findPublicationRowById(context.publicationId),
                    ),
                  ).toBe(true)

                  expect(Option.isSome(yield* comments.findCommentRowById(context.commentId))).toBe(
                    true,
                  )
                  return context
                }),
            }),
          ),
      })

      Scenario("Deleting account removes organization membership", {
        layer: PeopleFeatureTestLayer,
        steps: () =>
          runSteps(
            Given("{string:name} is an {string:role} of {string:organization}", {
              params: Schema.Struct({
                name: Schema.String,
                role: OrganizationAccessLevel,
                organization: Schema.String,
              }),
              handler: (_, { name, role, organization }) =>
                Effect.gen(function* () {
                  const context = yield* getBackgroundContext(DeletionBackground)
                  const organizationId = yield* createOrganization(
                    organization,
                    context.administratorId,
                  )
                  const organizations = yield* OrganizationsRepository

                  yield* organizations.insertMembership(
                    yield* makeMembershipFixture({
                      organizationId,
                      personId: personNamed(context.actors, name),
                      accessLevel: role,
                    }),
                  )

                  return { ...context, organizationId }
                }),
            }),
            And("{string:organization} has other MANAGERs", {
              params: Schema.Struct({ organization: Schema.String }),
              handler: (context) =>
                Effect.gen(function* () {
                  const organizations = yield* OrganizationsRepository

                  expect(
                    Option.getOrThrow(
                      yield* organizations.findMembership({
                        organizationId: context.organizationId,
                        personId: context.administratorId,
                      }),
                    ).accessLevel,
                  ).toBe("MANAGER")

                  const organizationBefore = yield* organizations.findById(context.organizationId)
                  const managerBefore = yield* organizations.findMembership({
                    organizationId: context.organizationId,
                    personId: context.administratorId,
                  })
                  return { ...context, organizationBefore, managerBefore }
                }),
            }),
            When("{string:name} confirms deletion of their account and personal content", {
              params: NamedPerson,
              handler: (context, { name }) =>
                Effect.gen(function* () {
                  expect(yield* confirmPersonalDeletion(personNamed(context.actors, name))).toEqual(
                    { _tag: "Success" },
                  )
                  return context
                }),
            }),
            Then("{string:name} is no longer a member of {string:organization}", {
              params: Schema.Struct({ name: Schema.String, organization: Schema.String }),
              handler: (context, { name }) =>
                Effect.gen(function* () {
                  const organizations = yield* OrganizationsRepository

                  expect(
                    Option.isNone(
                      yield* organizations.findMembership({
                        organizationId: context.organizationId,
                        personId: personNamed(context.actors, name),
                      }),
                    ),
                  ).toBe(true)

                  expect(yield* organizations.findById(context.organizationId)).toEqual(
                    context.organizationBefore,
                  )

                  expect(
                    yield* organizations.findMembership({
                      organizationId: context.organizationId,
                      personId: context.administratorId,
                    }),
                  ).toEqual(context.managerBefore)

                  yield* expectPersonDeleted(context.personId)
                  return context
                }),
            }),
          ),
      })

      Scenario("Sole member must confirm organization deletion", {
        layer: PeopleFeatureTestLayer,
        steps: () =>
          runSteps(
            givenSoleMemberOrganization(),
            When(
              "{string:name} requests account deletion without confirming organization deletion",
              {
                params: NamedPerson,
                handler: (context, { name }) =>
                  Effect.gen(function* () {
                    const result = yield* confirmPersonalDeletion(personNamed(context.actors, name))
                    return { ...context, result }
                  }),
              },
            ),
            Then("they are asked to confirm deletion of {string:organization} and its content", {
              params: Schema.Struct({ organization: Schema.String }),
              handler: (context) =>
                Effect.sync(() => {
                  expect(context.result).toEqual({
                    _tag: "ConfirmOrgDeletion",
                    organizations: [context.organizationId],
                  })
                  return context
                }),
            }),
            And("{string:name}'s account still exists", {
              params: NamedPerson,
              handler: (context, { name }) =>
                Effect.gen(function* () {
                  const personId = personNamed(context.actors, name)
                  const profiles = yield* ProfileService
                  expect(
                    Option.isSome(yield* withPerson(profiles.findById(personId), personId)),
                  ).toBe(true)
                  return context
                }),
            }),
            And("{string:organization} still exists", {
              params: Schema.Struct({ organization: Schema.String }),
              handler: (context) =>
                Effect.gen(function* () {
                  const organizations = yield* OrganizationsRepository
                  const publications = yield* PublicationsRepository
                  expect(Option.isSome(yield* organizations.findById(context.organizationId))).toBe(
                    true,
                  )

                  expect(
                    Option.isSome(
                      yield* organizations.findMembership({
                        organizationId: context.organizationId,
                        personId: context.personId,
                      }),
                    ),
                  ).toBe(true)

                  expect(
                    Option.isSome(
                      yield* publications.findPublicationRowById(
                        context.organizationPublication.id,
                      ),
                    ),
                  ).toBe(true)

                  return context
                }),
            }),
          ),
      })

      Scenario("Deleting sole member deletes the organization after confirmation", {
        layer: PeopleFeatureTestLayer,
        steps: () =>
          runSteps(
            givenSoleMemberOrganization(),
            When(
              "{string:name} confirms deletion of their account, {string:organization}, and their content",
              {
                params: Schema.Struct({ name: Schema.String, organization: Schema.String }),
                handler: (context, { name }) =>
                  Effect.gen(function* () {
                    const people = yield* PeopleService
                    const personId = personNamed(context.actors, name)

                    const confirmation = yield* withPerson(
                      people.deleteCurrentPerson({
                        shouldDeleteOrgs: true,
                        shouldDeleteContent: false,
                      }),
                      personId,
                    )

                    expect(confirmation).toMatchObject({
                      _tag: "ConfirmContentDeletion",
                      organizationContent: [
                        { organizationId: context.organizationId, contentCount: { posts: 1 } },
                      ],
                    })

                    expect(yield* confirmPersonalDeletion(personId, true)).toEqual({
                      _tag: "Success",
                    })
                    return context
                  }),
              },
            ),
            Then("{string:name}'s profile no longer exists", {
              params: NamedPerson,
              handler: (context, { name }) =>
                expectPersonDeleted(personNamed(context.actors, name)).pipe(Effect.as(context)),
            }),
            And("{string:organization} no longer exists", {
              params: Schema.Struct({ organization: Schema.String }),
              handler: (context) =>
                Effect.gen(function* () {
                  const organizations = yield* OrganizationsRepository
                  const profiles = yield* ProfileService
                  expect(Option.isNone(yield* organizations.findById(context.organizationId))).toBe(
                    true,
                  )

                  expect(
                    Option.isNone(
                      yield* withSession(
                        profiles.findById(context.organizationId),
                        VISITOR_SESSION,
                      ),
                    ),
                  ).toBe(true)

                  expect(yield* organizations.listMembers(context.organizationId)).toEqual([])
                  return context
                }),
            }),
            And("{string:organization}'s publications are deleted", {
              params: Schema.Struct({ organization: Schema.String }),
              handler: (context) =>
                Effect.gen(function* () {
                  const publications = yield* PublicationsRepository

                  expect(
                    Option.isNone(
                      yield* publications.findPublicationRowById(
                        context.organizationPublication.id,
                      ),
                    ),
                  ).toBe(true)

                  return context
                }),
            }),
          ),
      })
    })
  }).pipe(Effect.provide(NodeServices.layer)),
)
