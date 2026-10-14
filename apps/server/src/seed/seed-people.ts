import {
  AuthSecurityRevision,
  Email,
  IdGen,
  OrganizationAccessLevel,
  OrganizationId,
  OrganizationInvitationId,
  OrganizationInvitationStatus,
  OrganizationRow,
  PersonId,
  PlatformAccessLevel,
  ProfileVisibility,
  stringToHandle,
  type Handle,
} from "@gororobas/domain"
import {
  Array as EffectArray,
  DateTime,
  Duration,
  Effect,
  MutableHashSet,
  Random,
  Schema,
} from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { SqlClient } from "effect/sql"

import { OrganizationsRepository } from "../organizations/repository.js"
import { PeopleRepository } from "../people/repository.js"
import { ProfilesRepository } from "../profiles/repository.js"
import { shortText } from "./rich-text.js"
import {
  activePeople,
  reviewers,
  type SeededOrganization,
  type SeededPerson,
  type SeedContext,
} from "./seed-context.js"
import { chance, pick, pickOption, pickWeighted, sample } from "./seed-random.js"
import {
  FIRST_NAMES,
  ORGANIZATION_CORES,
  ORGANIZATION_PREFIXES,
  PLACES,
  SURNAMES,
} from "./vocabulary.js"

/** Domain reserved for seeded accounts; `.test` can never receive real email. */
export const SEED_EMAIL_DOMAIN = "gororobas.test"

/**
 * Stable accounts for signing in as each access level, identical across seeds and scales.
 */
export const SEED_PERSONAS = [
  { handle: "admin", name: "Adriana Administradora", accessLevel: "ADMIN" },
  { handle: "moderator", name: "Moacir Moderador", accessLevel: "MODERATOR" },
  { handle: "community", name: "Cora Comunidade", accessLevel: "COMMUNITY" },
  { handle: "newcomer", name: "Nina Novata", accessLevel: "NEWCOMER" },
  { handle: "blocked", name: "Bento Bloqueado", accessLevel: "BLOCKED" },
] as const satisfies ReadonlyArray<{
  handle: string
  name: string
  accessLevel: PlatformAccessLevel
}>

export const personaEmail = (handle: string) => `${handle}@${SEED_EMAIL_DOMAIN}`

/** Keeps handles unique, suffixing namesakes the way people expect to read them. */
export const makeHandleRegistry = () => {
  const used = MutableHashSet.empty<string>()

  const firstAvailable = (root: string, suffix: number): string => {
    const candidate = suffix === 1 ? root : `${root}-${suffix}`
    return MutableHashSet.has(used, candidate) ? firstAvailable(root, suffix + 1) : candidate
  }

  return (base: string) =>
    Effect.gen(function* () {
      const root = yield* stringToHandle(base).pipe(Effect.orElseSucceed(() => "pessoa"))
      const handle = firstAvailable(root, 1)
      MutableHashSet.add(used, handle)
      return yield* stringToHandle(handle)
    })
}

export type HandleRegistry = ReturnType<typeof makeHandleRegistry>

const insertPerson = (input: {
  readonly id: PersonId
  readonly handle: Handle
  readonly name: string
  readonly accessLevel: PlatformAccessLevel
  readonly accessSetById: PersonId | null
  readonly isPersona: boolean
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const profiles = yield* ProfilesRepository
    const people = yield* PeopleRepository
    const now = yield* DateTime.now
    const timestamp = DateTime.formatIso(now)
    const email = yield* Schema.decodeEffect(Email)(personaEmail(input.handle))

    yield* sql`INSERT INTO auth_subjects ${sql.insert({
      id: input.id,
      email,
      isEmailVerified: 1,
      securityRevision: yield* IdGen.make(AuthSecurityRevision),
      claimedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })}`

    yield* profiles.insertProfile({
      id: input.id,
      type: "PERSON",
      handle: input.handle,
      name: input.name,
      bio: (yield* chance(input.isPersona ? 1 : 0.6)) ? yield* shortText("pt") : null,
      location: (yield* chance(0.7)) ? yield* pick(PLACES) : null,
      photoId: null,
      visibility: input.isPersona
        ? "PUBLIC"
        : yield* pickWeighted(ProfileVisibility.literals, { PUBLIC: 4, COMMUNITY: 1 }),
      createdAt: now,
      updatedAt: now,
    })

    yield* people.insertRow({
      id: input.id,
      accessLevel: input.accessLevel,
      accessSetById: input.accessSetById,
      accessSetAt: input.accessSetById ? now : null,
    })

    return email
  })

const attachProfilePhoto = (
  context: Pick<SeedContext, "media">,
  input: { profileId: PersonId | OrganizationId; at: number; probability: number },
) =>
  Effect.gen(function* () {
    if (!(yield* chance(input.probability))) return

    const sql = yield* SqlClient.SqlClient

    const photoId = yield* context.media.create({
      ownerProfileId: input.profileId,
      at: input.at,
      creditablePeople: [],
    })

    yield* sql`UPDATE profiles SET photo_id = ${photoId} WHERE id = ${input.profileId}`
  })

const seedPerson = (
  context: Pick<SeedContext, "media" | "timeline">,
  input: {
    readonly name: string
    readonly preferredHandle: string
    readonly accessLevel: PlatformAccessLevel
    readonly accessSetById: PersonId | null
    readonly joinedAt: number
    readonly isPersona: boolean
    readonly handles: HandleRegistry
  },
) =>
  Effect.gen(function* () {
    const id = yield* context.timeline.at(input.joinedAt)(IdGen.make(PersonId))
    const handle = yield* input.handles(input.preferredHandle)

    const email = yield* context.timeline.at(input.joinedAt)(
      insertPerson({
        id,
        handle,
        name: input.name,
        accessLevel: input.accessLevel,
        accessSetById: input.accessSetById,
        isPersona: input.isPersona,
      }),
    )

    yield* attachProfilePhoto(context, {
      profileId: id,
      at: input.joinedAt,
      probability: input.isPersona ? 1 : 0.55,
    })

    return {
      id,
      handle,
      name: input.name,
      email,
      accessLevel: input.accessLevel,
      joinedAt: input.joinedAt,
    } satisfies SeededPerson
  })

export const seedPeople = (
  context: Pick<SeedContext, "media" | "timeline">,
  input: { count: number; handles: HandleRegistry },
) =>
  Effect.gen(function* () {
    const { timeline } = context
    const founded = timeline.daysBeforeAnchor(730)
    const [administrator, ...otherPersonas] = SEED_PERSONAS

    // The administrator joins first and grants everyone else their access level.
    const admin = yield* seedPerson(context, {
      ...administrator,
      preferredHandle: administrator.handle,
      accessSetById: null,
      joinedAt: founded,
      isPersona: true,
      handles: input.handles,
    })

    const personas = yield* Effect.forEach(
      otherPersonas,
      (persona, index) =>
        seedPerson(context, {
          ...persona,
          preferredHandle: persona.handle,
          accessSetById: persona.accessLevel === "NEWCOMER" ? null : admin.id,
          joinedAt: founded + Duration.toMillis(Duration.days(index + 1)),
          isPersona: true,
          handles: input.handles,
        }),
      { concurrency: 1 },
    )

    const staff = reviewers({ people: [admin, ...personas] })

    const generated = yield* Effect.forEach(
      EffectArray.makeBy(Math.max(0, input.count - SEED_PERSONAS.length), (index) => index),
      () =>
        Effect.gen(function* () {
          const name = `${yield* pick(FIRST_NAMES)} ${yield* pick(SURNAMES)}`

          const accessLevel = yield* pickWeighted(PlatformAccessLevel.literals, {
            COMMUNITY: 60,
            NEWCOMER: 25,
            MODERATOR: 5,
            ADMIN: 1,
            BLOCKED: 3,
          })

          const setBy = accessLevel === "NEWCOMER" ? undefined : yield* pickOption(staff)

          return yield* seedPerson(context, {
            name,
            preferredHandle: name,
            accessLevel,
            accessSetById: setBy?.id ?? null,
            joinedAt: yield* timeline.between(founded, timeline.daysBeforeAnchor(7)),
            isPersona: false,
            handles: input.handles,
          })
        }),
      { concurrency: 1 },
    )

    return [admin, ...personas, ...generated]
  })

const seedOrganization = (
  context: Pick<SeedContext, "media" | "timeline" | "people">,
  input: { row: OrganizationRow; founder: SeededPerson; handles: HandleRegistry },
) =>
  Effect.gen(function* () {
    const profiles = yield* ProfilesRepository
    const organizations = yield* OrganizationsRepository
    const { founder } = input
    const members = activePeople(context)
    const createdAt = yield* context.timeline.between(founder.joinedAt)
    const name = `${yield* pick(ORGANIZATION_PREFIXES)} ${yield* pick(ORGANIZATION_CORES)}`
    const handle = yield* input.handles(name)

    const organization = yield* context.timeline.at(createdAt)(
      Effect.gen(function* () {
        const id = yield* IdGen.make(OrganizationId)
        const now = yield* DateTime.now

        yield* profiles.insertProfile({
          id,
          type: "ORGANIZATION",
          handle,
          name,
          bio: (yield* chance(0.8)) ? yield* shortText("pt") : null,
          location: (yield* chance(0.8)) ? yield* pick(PLACES) : null,
          photoId: null,
          visibility: yield* pickWeighted(ProfileVisibility.literals, { PUBLIC: 5, COMMUNITY: 1 }),
          createdAt: now,
          updatedAt: now,
        })

        yield* organizations.insertRow({ ...input.row, id })

        const joined = yield* sample(
          members.filter((person) => person.id !== founder.id),
          yield* Random.nextIntBetween(0, 8),
        )

        const membership = [
          { personId: founder.id, accessLevel: "MANAGER" as const },
          ...(yield* Effect.forEach(
            joined,
            (person) =>
              Effect.map(
                pickWeighted(OrganizationAccessLevel.literals, {
                  MANAGER: 1,
                  EDITOR: 3,
                  VIEWER: 6,
                }),
                (accessLevel) => ({ personId: person.id, accessLevel }),
              ),
            { concurrency: 1 },
          )),
        ]

        yield* Effect.forEach(
          membership,
          (member) =>
            organizations.insertMembership({
              ...member,
              organizationId: id,
              createdAt: now,
              updatedAt: now,
            }),
          { concurrency: 1, discard: true },
        )

        const invited = yield* sample(
          members.filter((person) => !membership.some((member) => member.personId === person.id)),
          yield* Random.nextIntBetween(0, 2),
        )
        const emails = [
          ...invited.map((person) => person.email),
          ...((yield* chance(0.4)) ? [`convite-${handle}@${SEED_EMAIL_DOMAIN}`] : []),
        ]

        yield* Effect.forEach(
          emails,
          (email) =>
            Effect.gen(function* () {
              yield* organizations.insertInvitation({
                id: yield* IdGen.make(OrganizationInvitationId),
                organizationId: id,
                email: yield* Schema.decodeEffect(Email)(email),
                accessLevel: yield* pick(OrganizationAccessLevel.literals),
                status: yield* pickWeighted(OrganizationInvitationStatus.literals, {
                  PENDING: 3,
                  ACCEPTED: 1,
                  EXPIRED: 1,
                }),
                createdById: founder.id,
                createdAt: now,
                updatedAt: now,
              })
            }),
          { concurrency: 1, discard: true },
        )

        return { id, handle, name, createdAt, members: membership } satisfies SeededOrganization
      }),
    )

    yield* attachProfilePhoto(context, {
      profileId: organization.id,
      at: createdAt,
      probability: 0.7,
    })

    return organization
  })

export const seedOrganizations = (
  context: Pick<SeedContext, "media" | "timeline" | "people">,
  input: { count: number; handles: HandleRegistry },
) =>
  Effect.gen(function* () {
    // Schema arbitraries choose organization types and member visibility from the domain enums.
    const rows = yield* Arbitrary.sampleEffect(Arbitrary.schema(OrganizationRow), {
      count: input.count,
      seed: yield* Random.nextInt,
    }).pipe(Effect.orDie)

    const founders = activePeople(context)

    return yield* Effect.forEach(
      rows,
      (row) =>
        Effect.gen(function* () {
          const founder = yield* pickOption(founders)
          if (!founder) return []
          return [yield* seedOrganization(context, { row, founder, handles: input.handles })]
        }),
      { concurrency: 1 },
    ).pipe(Effect.map((organizations) => organizations.flat()))
  })
