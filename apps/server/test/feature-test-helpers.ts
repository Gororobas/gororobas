import { ContentLanguage } from "@gororobas/domain"
import {
  Handle,
  IdGen,
  MagicLinkIdentity,
  PersonId,
  PersonProfileRow,
  ProfileVisibility,
  PlatformAccessLevel,
  SessionContext,
  type ProfileId,
  type TiptapDocument,
  type ProfileRowUpdate,
} from "@gororobas/domain"
import { resolveSessionFromAuthSubjectId } from "@gororobas/server/session-service"
import { Effect, Layer, Match, Option, Record, Schema } from "effect"

import { provisionMagicLinkAccount } from "../src/authentication/auth-subjects.js"
import { CommentsRepository } from "../src/comments/repository.js"
import { CommentsService } from "../src/comments/service.js"
import { OrganizationsRepository } from "../src/organizations/repository.js"
import { PeopleService } from "../src/people/service.js"
import { PublicationsRepository } from "../src/publications/repository.js"
import { PublicationsService } from "../src/publications/service.js"
import { WikiArticlesRepository } from "../src/wiki/repository.js"
import {
  makeOrganizationFixture,
  makeOrganizationProfileFixture,
  makeMembershipFixture,
} from "./fixtures.js"
import {
  seedPerson,
  withSession,
  TestLayerWithServices,
  insertOrganizationWithDependencies,
} from "./test-helpers.js"

export const PeopleBackground = Schema.Struct({
  administratorId: PersonId,
  actors: Schema.Record(Schema.String, PersonId),
})
export const NamedHandle = Schema.Struct({ name: Schema.String, handle: Handle })

export const ProfileTestDataTable = Schema.Struct({
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

export const profileUpdateFromTestDataTable = (table: typeof ProfileTestDataTable.Type.table) =>
  table.reduce<ProfileRowUpdate>(
    (update, row) =>
      Match.value(row).pipe(
        Match.when({ field: "handle" }, ({ value }) => ({ ...update, handle: value })),
        Match.when({ field: "name" }, ({ value }) => ({ ...update, name: value })),
        Match.when({ field: "location" }, ({ value }) => ({ ...update, location: value })),
        Match.when({ field: "visibility" }, ({ value }) => ({ ...update, visibility: value })),
        Match.when({ field: "bio" }, ({ value }): ProfileRowUpdate => ({
          ...update,
          bio: value === "" ? null : textToRichTextDocument(value),
        })),
        Match.exhaustive,
      ),
    {},
  )

export const personNamed = (actors: typeof PeopleBackground.Type.actors, name: string) =>
  Option.getOrThrow(Option.fromNullishOr(actors[name]))

export const provisionPerson = (name: string) =>
  Effect.gen(function* () {
    const emailId = yield* IdGen.make(PersonId)
    const email = yield* Schema.decodeEffect(MagicLinkIdentity.fields.email)(
      `${emailId}@example.com`,
    )
    const subjectId = yield* provisionMagicLinkAccount({ name, email })
    return yield* Schema.decodeEffect(PersonId)(subjectId)
  })

export const provisionCommunityPerson = (administratorId: PersonId, name: string) =>
  Effect.gen(function* () {
    const personId = yield* provisionPerson(name)
    const people = yield* PeopleService
    yield* withSession(
      people.setAccessLevel(personId, "COMMUNITY"),
      yield* resolveSessionFromAuthSubjectId(administratorId),
    )
    return personId
  })

/** The first administrator must be bootstrapped before production approval can run. */
export const provisionAdministrator = () =>
  seedPerson("ADMIN").pipe(Effect.map(({ person }) => person.id))

export const PeopleTestDataTable = Schema.Struct({
  table: Schema.Array(Schema.Struct({ name: Schema.String, accessLevel: PlatformAccessLevel })),
})

export const provisionPeople = (table: typeof PeopleTestDataTable.Type.table) =>
  Effect.gen(function* () {
    const bootstrapAdministratorId = yield* provisionAdministrator()
    const people = yield* PeopleService

    const entries = yield* Effect.forEach(
      table,
      ({ name, accessLevel }) =>
        Effect.gen(function* () {
          const personId = yield* provisionPerson(name)

          if (accessLevel !== "NEWCOMER") {
            yield* withPerson(
              people.setAccessLevel(personId, accessLevel),
              bootstrapAdministratorId,
            )
          }

          return [name, personId] as const
        }),
      { concurrency: 1 },
    )

    const actors = Record.fromEntries(entries)

    // Feature administrators replace the bootstrap account so sole-admin scenarios have exactly one administrator.
    const administrator = table.find(({ accessLevel }) => accessLevel === "ADMIN")
    const administratorId = administrator
      ? personNamed(actors, administrator.name)
      : bootstrapAdministratorId

    if (administrator) {
      yield* withPerson(
        people.setAccessLevel(bootstrapAdministratorId, "COMMUNITY"),
        administratorId,
      )
    }

    return { administratorId, actors }
  })

export const withPerson = <A, E, R>(
  action: Effect.Effect<A, E, R | SessionContext>,
  personId: PersonId,
) =>
  resolveSessionFromAuthSubjectId(personId).pipe(
    Effect.flatMap((session) => withSession(action, session)),
  )

export const textToRichTextDocument = (text: string): TiptapDocument => ({
  type: "doc",
  version: 1,
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
})

const ContentRepositoriesLayer = Layer.mergeAll(
  Layer.effect(PublicationsRepository, PublicationsRepository.make),
  Layer.effect(CommentsRepository, CommentsRepository.make),
  Layer.effect(WikiArticlesRepository, WikiArticlesRepository.make),
).pipe(Layer.provideMerge(TestLayerWithServices))

export const PeopleFeatureTestLayer = Layer.mergeAll(
  Layer.effect(PublicationsService, PublicationsService.make),
  Layer.effect(CommentsService, CommentsService.make),
).pipe(Layer.provideMerge(ContentRepositoriesLayer))

export const createPost = ({
  personId,
  ownerProfileId,
  content,
  visibility = "PUBLIC",
}: {
  personId: PersonId
  ownerProfileId: ProfileId
  content: string
  visibility?: ProfileVisibility
}) =>
  PublicationsService.use((service) =>
    withPerson(
      service.createPublication({
        kind: "POST",
        ownerProfileId,
        content: textToRichTextDocument(content),
        sourceLanguage: ContentLanguage.make("pt"),
        visibility,
      }),
      personId,
    ),
  )

export const createOrganization = (name: string, managerId: PersonId) =>
  Effect.gen(function* () {
    const organization = yield* makeOrganizationFixture()
    const profile = yield* makeOrganizationProfileFixture({ id: organization.id, name })
    yield* insertOrganizationWithDependencies({ organization, profile })
    const organizations = yield* OrganizationsRepository

    yield* organizations.insertMembership(
      yield* makeMembershipFixture({
        organizationId: organization.id,
        personId: managerId,
        accessLevel: "MANAGER",
      }),
    )

    return organization.id
  })
