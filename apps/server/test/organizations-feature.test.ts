import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import {
  Handle,
  IdGen,
  InformationVisibility,
  OrganizationAccessLevel,
  OrganizationId,
  OrganizationType,
  PersonId,
  TrustedAccessLevel,
} from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
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
import { DateTime, Effect, Layer, Option, Result, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { TestClock } from "effect/testing"

import { OrganizationsRepository } from "../src/organizations/repository.js"
import { OrganizationsService } from "../src/organizations/service.js"
import { PeopleService } from "../src/people/service.js"
import { ProfilesRepository } from "../src/profiles/repository.js"
import { ProfileService } from "../src/profiles/service.js"
import {
  PeopleBackground,
  PeopleTestDataTable,
  personNamed,
  provisionPeople,
  withPerson,
} from "./feature-test-helpers.js"
import { TestLayerWithServices, withSession } from "./test-helpers.js"

const OrganizationsFeatureTestLayer = Layer.effect(
  OrganizationsService,
  OrganizationsService.make,
).pipe(Layer.provideMerge(TestLayerWithServices))
const OrganizationsBackground = Schema.Struct({
  ...PeopleBackground.fields,
  organizations: Schema.Record(Schema.String, OrganizationId),
})
type OrganizationContext = typeof OrganizationsBackground.Type
const NamedOrganization = Schema.Struct({ organization: Schema.String })
const ActorOrganization = Schema.Struct({ name: Schema.String, organization: Schema.String })
const MemberOrganization = Schema.Struct({
  ...ActorOrganization.fields,
  role: OrganizationAccessLevel,
})
const ProfileName = Schema.Struct({ ...ActorOrganization.fields, profileName: Schema.String })

const Invitation = Schema.Struct({
  actor: Schema.String,
  target: Schema.String,
  organization: Schema.String,
})

const organizationNamed = (context: OrganizationContext, name: string) =>
  Option.getOrThrow(Option.fromNullishOr(context.organizations[name]))
const background = () => getBackgroundContext(OrganizationsBackground)

const createNamedOrganization = ({
  name,
  personId,
  type = "TERRITORY",
}: {
  name: string
  personId: PersonId
  type?: OrganizationType
}) =>
  Effect.gen(function* () {
    const service = yield* OrganizationsService
    const handleId = yield* IdGen.make(OrganizationId)
    const handle = yield* Schema.decodeEffect(Handle)(
      `org-${handleId.replaceAll("-", "").slice(0, 24)}`,
    )
    return yield* withPerson(service.createOrganization({ name, type, handle }), personId)
  })

const deniedAction = <A, E, R, B, ReadError, ReadRequirements>(
  action: Effect.Effect<A, E, R>,
  {
    context,
    readAffected,
  }: {
    context: OrganizationContext
    readAffected: Effect.Effect<B, ReadError, ReadRequirements>
  },
) =>
  Effect.gen(function* () {
    const before = yield* readAffected
    const error = yield* action.pipe(Effect.flip)
    expect(yield* readAffected).toEqual(before)
    return { ...context, error }
  })

const accessDenied = () =>
  Then("access is denied", {
    handler: (context: OrganizationContext & { error: unknown }) =>
      Effect.sync(() => {
        expect(context.error).toMatchObject({ _tag: "UnauthorizedError" })
        return context
      }),
  })

const membershipStep = {
  params: MemberOrganization,
  handler: (_: OrganizationContext, { name, role, organization }: typeof MemberOrganization.Type) =>
    Effect.gen(function* () {
      const context = yield* background()
      const service = yield* OrganizationsService
      const organizationId = organizationNamed(context, organization)
      const personId = personNamed(context.actors, name)
      const members = yield* withPerson(service.listMembers(organizationId), personId)
      expect(members).toContainEqual(
        expect.objectContaining({ personId, organizationId, accessLevel: role }),
      )
      return context
    }),
}

const membershipIs = () =>
  Then("{string:name} is a {string:role} of {string:organization}", membershipStep)
const membershipIsEditor = () =>
  Then("{string:name} is an {string:role} of {string:organization}", membershipStep)
const membershipRemains = () =>
  And("{string:name} remains a {string:role} of {string:organization}", membershipStep)

const noMembership = () =>
  Then("{string:name} is no longer a member of {string:organization}", {
    params: ActorOrganization,
    handler: (_, { name, organization }) =>
      Effect.gen(function* () {
        const context = yield* background()
        const organizations = yield* OrganizationsRepository

        expect(
          Option.isNone(
            yield* organizations.findMembership({
              organizationId: organizationNamed(context, organization),
              personId: personNamed(context.actors, name),
            }),
          ),
        ).toBe(true)

        return context
      }),
  })

const givenPeople = () =>
  Given("the following people exist:", {
    params: PeopleTestDataTable,
    handler: (_, { table }) =>
      provisionPeople(table).pipe(Effect.map((context) => ({ ...context, organizations: {} }))),
  })

const givenOrganization = () =>
  And("the organization {string:organization} exists", {
    params: NamedOrganization,
    handler: (context: OrganizationContext, { organization }) =>
      Effect.gen(function* () {
        const created = yield* createNamedOrganization({
          name: organization,
          personId: context.administratorId,
        })
        return {
          ...context,
          organizations: { ...context.organizations, [organization]: created.id },
        }
      }),
  })

const MembershipTable = Schema.Struct({
  organization: Schema.String,
  table: Schema.Array(
    Schema.Struct({ name: Schema.String, organizationAccessLevel: OrganizationAccessLevel }),
  ),
})

const membershipSetup = {
  params: MembershipTable,
  handler: (context: OrganizationContext, { organization, table }: typeof MembershipTable.Type) =>
    Effect.gen(function* () {
      const service = yield* OrganizationsService
      const organizationId = organizationNamed(context, organization)

      yield* Effect.forEach(
        table,
        ({ name, organizationAccessLevel }) =>
          Effect.gen(function* () {
            const personId = personNamed(context.actors, name)

            yield* withPerson(
              service.inviteMember({
                organizationId,
                personId,
                accessLevel: organizationAccessLevel,
              }),
              context.administratorId,
            )

            yield* withPerson(service.acceptInvitation(organizationId), personId)
          }),
        { concurrency: 1 },
      )

      yield* withPerson(service.leaveOrganization(organizationId), context.administratorId)
      return context
    }),
}

const givenMemberships = () =>
  And("the following memberships exist for {string:organization}:", membershipSetup)
const givenMembers = () =>
  And("the following members exist for {string:organization}:", membershipSetup)

const tryInvitation = () =>
  When("{string:actor} tries to invite {string:target} to join {string:organization}", {
    params: Invitation,
    handler: (_, { actor, target, organization }) =>
      Effect.gen(function* () {
        const context = yield* background()
        const service = yield* OrganizationsService
        const organizations = yield* OrganizationsRepository
        const organizationId = organizationNamed(context, organization)
        const personId = context.actors[target] ?? (yield* IdGen.make(PersonId))

        const invitationsBefore = yield* organizations.listInvitations(organizationId)

        const denied = yield* deniedAction(
          withPerson(
            service.inviteMember({
              organizationId,
              personId,
              accessLevel: "VIEWER",
            }),
            personNamed(context.actors, actor),
          ),
          { context, readAffected: organizations.listInvitations(organizationId) },
        )

        return { ...denied, organizationId, invitationsBefore }
      }),
  })

const OrganizationProfileName = Schema.Struct({
  organization: Schema.String,
  profileName: Schema.String,
})

const profileNameStep = {
  params: OrganizationProfileName,
  handler: (
    _: OrganizationContext,
    { organization, profileName }: typeof OrganizationProfileName.Type,
  ) =>
    Effect.gen(function* () {
      const context = yield* background()
      const profiles = yield* ProfileService

      const profile = Option.getOrThrow(
        yield* withSession(
          profiles.findById(organizationNamed(context, organization)),
          VISITOR_SESSION,
        ),
      )

      expect(profile.name).toBe(profileName)
      return context
    }),
}

const profileNameBecomes = () =>
  Then("{string:organization} profile name becomes {string:profileName}", profileNameStep)
const profileNameRemains = () =>
  And("{string:organization} profile name remains {string:profileName}", profileNameStep)

const leave = () =>
  When("{string:name} leaves {string:organization}", {
    params: ActorOrganization,
    handler: (_, { name, organization }) =>
      Effect.gen(function* () {
        const context = yield* background()
        const service = yield* OrganizationsService
        yield* withPerson(
          service.leaveOrganization(organizationNamed(context, organization)),
          personNamed(context.actors, name),
        )
        return context
      }),
  })

const givenInvitation = () =>
  Given(
    "{string:actor} has invited {string:target} to join {string:organization} as a {string:role}",
    {
      params: Schema.Struct({ ...Invitation.fields, role: OrganizationAccessLevel }),
      handler: (_, { actor, target, organization, role }) =>
        Effect.gen(function* () {
          const context = yield* background()
          const service = yield* OrganizationsService
          const organizations = yield* OrganizationsRepository
          const organizationId = organizationNamed(context, organization)
          const personId = personNamed(context.actors, target)
          const invitation = yield* withPerson(
            service.inviteMember({ organizationId, personId, accessLevel: role }),
            personNamed(context.actors, actor),
          )

          expect(invitation).toMatchObject({
            status: "PENDING",
            accessLevel: role,
            createdById: personNamed(context.actors, actor),
          })

          expect(
            Option.isNone(yield* organizations.findMembership({ organizationId, personId })),
          ).toBe(true)

          return { ...context, invitation }
        }),
    },
  )

await Effect.runPromise(
  describeFeature("./organizations.feature", ({ Rule }) => {
    Rule(
      "Only people with community access can create organizations",
      ({ Background, Scenario }) => {
        Background({ layer: OrganizationsFeatureTestLayer, steps: () => runSteps(givenPeople()) })

        Scenario("Member with community access creates an organization", {
          layer: OrganizationsFeatureTestLayer,
          steps: () =>
            runSteps(
              When(
                "{string:name} creates an organization named {string:organization} of type {string:type}",
                {
                  params: Schema.Struct({ ...ActorOrganization.fields, type: OrganizationType }),
                  handler: (_, { name, organization, type }) =>
                    Effect.gen(function* () {
                      const context = yield* background()

                      const created = yield* createNamedOrganization({
                        name: organization,
                        personId: personNamed(context.actors, name),
                        type,
                      })

                      const organizations = yield* OrganizationsRepository
                      expect(
                        Option.getOrThrow(yield* organizations.findById(created.id)).type,
                      ).toBe(type)

                      return {
                        ...context,
                        organizationId: created.id,
                        organizationName: organization,
                        creatorId: personNamed(context.actors, name),
                      }
                    }),
                },
              ),
              Then("the organization {string:organization} exists", {
                params: NamedOrganization,
                handler: (context, { organization }) =>
                  Effect.gen(function* () {
                    expect(context.organizationName).toBe(organization)
                    const service = yield* ProfileService

                    expect(
                      Option.getOrThrow(
                        yield* withSession(
                          service.findById(context.organizationId),
                          VISITOR_SESSION,
                        ),
                      ),
                    ).toMatchObject({
                      id: context.organizationId,
                      name: organization,
                      type: "ORGANIZATION",
                    })

                    return context
                  }),
              }),
              And("{string:name} is a {string:role} of {string:organization}", {
                params: MemberOrganization,
                handler: (context, { name, role, organization }) =>
                  Effect.gen(function* () {
                    const service = yield* OrganizationsService
                    expect(context.organizationName).toBe(organization)

                    expect(
                      yield* withPerson(
                        service.listMembers(context.organizationId),
                        personNamed(context.actors, name),
                      ),
                    ).toEqual([
                      expect.objectContaining({
                        organizationId: context.organizationId,
                        personId: context.creatorId,
                        accessLevel: role,
                      }),
                    ])

                    return context
                  }),
              }),
            ),
        })

        const deniedCreation = () =>
          runSteps(
            When("{string:name} tries to create an organization", {
              params: Schema.Struct({ name: Schema.String }),
              handler: (_, { name }) =>
                Effect.gen(function* () {
                  const context = yield* background()
                  const service = yield* OrganizationsService
                  const profiles = yield* ProfilesRepository
                  const handle = yield* Schema.decodeEffect(Handle)("forbidden-organization")

                  return yield* deniedAction(
                    withPerson(
                      service.createOrganization({
                        name: "Forbidden organization",
                        handle,
                        type: "TERRITORY",
                      }),
                      personNamed(context.actors, name),
                    ),
                    { context, readAffected: profiles.findByHandle(handle) },
                  )
                }),
            }),
            accessDenied(),
          )

        Scenario("Person awaiting access cannot create an organization", {
          layer: OrganizationsFeatureTestLayer,
          steps: deniedCreation,
        })
        Scenario("Blocked person cannot create an organization", {
          layer: OrganizationsFeatureTestLayer,
          steps: deniedCreation,
        })

        Scenario("Visitor cannot create an organization", {
          layer: OrganizationsFeatureTestLayer,
          steps: () =>
            runSteps(
              When("a visitor tries to create an organization", {
                handler: () =>
                  Effect.gen(function* () {
                    const context = yield* background()
                    const service = yield* OrganizationsService
                    const profiles = yield* ProfilesRepository
                    const handle = yield* Schema.decodeEffect(Handle)("visitor-organization")

                    return yield* deniedAction(
                      withSession(
                        service.createOrganization({
                          name: "Visitor organization",
                          handle,
                          type: "TERRITORY",
                        }),
                        VISITOR_SESSION,
                      ),
                      { context, readAffected: profiles.findByHandle(handle) },
                    )
                  }),
              }),
              accessDenied(),
            ),
        })
      },
    )

    Rule(
      "Organization profile can only be edited by organization managers",
      ({ Background, Scenario }) => {
        Background({
          layer: OrganizationsFeatureTestLayer,
          steps: () => runSteps(givenPeople(), givenOrganization(), givenMemberships()),
        })

        Scenario("Manager edits organization profile", {
          layer: OrganizationsFeatureTestLayer,
          steps: () =>
            runSteps(
              When(
                "{string:name} updates {string:organization} profile name to {string:profileName}",
                {
                  params: ProfileName,
                  handler: (_, { name, organization, profileName }) =>
                    Effect.gen(function* () {
                      const context = yield* background()
                      const service = yield* OrganizationsService

                      yield* withPerson(
                        service.updateOrganization(organizationNamed(context, organization), {
                          name: profileName,
                        }),
                        personNamed(context.actors, name),
                      )

                      return context
                    }),
                },
              ),
              profileNameBecomes(),
            ),
        })

        Scenario("Editor cannot edit organization profile", {
          layer: OrganizationsFeatureTestLayer,
          steps: () =>
            runSteps(
              When(
                "{string:name} tries to update {string:organization} profile name to {string:profileName}",
                {
                  params: ProfileName,
                  handler: (_, { name, organization, profileName }) =>
                    Effect.gen(function* () {
                      const context = yield* background()
                      const service = yield* OrganizationsService
                      const profiles = yield* ProfileService
                      const organizationId = organizationNamed(context, organization)
                      const personId = personNamed(context.actors, name)

                      const before = yield* withSession(
                        profiles.findById(organizationId),
                        VISITOR_SESSION,
                      )

                      // ProfileService is another entry point to the same permission and must also deny editors.
                      expect(
                        yield* withPerson(
                          profiles.updateProfile(organizationId, { name: profileName }),
                          personId,
                        ).pipe(Effect.flip),
                      ).toMatchObject({ _tag: "UnauthorizedError" })

                      expect(
                        yield* withSession(profiles.findById(organizationId), VISITOR_SESSION),
                      ).toEqual(before)

                      return yield* deniedAction(
                        withPerson(
                          service.updateOrganization(organizationId, { name: profileName }),
                          personId,
                        ),
                        {
                          context,
                          readAffected: withSession(
                            profiles.findById(organizationId),
                            VISITOR_SESSION,
                          ),
                        },
                      )
                    }),
                },
              ),
              accessDenied(),
              profileNameRemains(),
            ),
        })
      },
    )

    Rule(
      "Organization invitations create memberships",
      ({ Background, Scenario, ScenarioOutline }) => {
        Background({
          layer: OrganizationsFeatureTestLayer,
          steps: () => runSteps(givenPeople(), givenOrganization(), givenMemberships()),
        })

        Scenario("Invitee accepts an invitation and becomes a member", {
          layer: OrganizationsFeatureTestLayer,
          steps: () =>
            runSteps(
              givenInvitation(),
              When("{string:name} accepts the invitation to join {string:organization}", {
                params: ActorOrganization,
                handler: (context, { name, organization }) =>
                  Effect.gen(function* () {
                    const service = yield* OrganizationsService
                    const organizations = yield* OrganizationsRepository
                    yield* withPerson(
                      service.acceptInvitation(organizationNamed(context, organization)),
                      personNamed(context.actors, name),
                    )

                    expect(
                      Option.getOrThrow(
                        yield* organizations.findInvitation({
                          organizationId: context.invitation.organizationId,
                          email: context.invitation.email,
                        }),
                      ).status,
                    ).toBe("ACCEPTED")

                    return context
                  }),
              }),
              membershipIs(),
            ),
        })

        ScenarioOutline("Invitations expire two weeks after creation", {
          layer: OrganizationsFeatureTestLayer,
          steps: () =>
            runSteps(
              givenInvitation(),
              When(
                "{string:name} tries to accept the invitation to join {string:organization} after {int:elapsedMilliseconds} milliseconds",
                {
                  params: Schema.Struct({
                    ...ActorOrganization.fields,
                    elapsedMilliseconds: Schema.Int,
                  }),
                  handler: (context, { name, organization, elapsedMilliseconds }) =>
                    Effect.gen(function* () {
                      yield* TestClock.setTime(
                        DateTime.toEpochMillis(
                          DateTime.add(context.invitation.createdAt, {
                            milliseconds: elapsedMilliseconds,
                          }),
                        ),
                      )

                      const service = yield* OrganizationsService
                      const result = yield* withPerson(
                        service.acceptInvitation(organizationNamed(context, organization)),
                        personNamed(context.actors, name),
                      ).pipe(Effect.result)
                      return { ...context, result, personId: personNamed(context.actors, name) }
                    }),
                },
              ),
              Then("the invitation is {word:outcome}", {
                params: Schema.Struct({ outcome: Schema.Literals(["accepted", "expired"]) }),
                handler: (context, { outcome }) =>
                  Effect.gen(function* () {
                    const organizations = yield* OrganizationsRepository
                    const organizationId = context.invitation.organizationId
                    expect(Result.isSuccess(context.result)).toBe(outcome === "accepted")

                    Result.match(context.result, {
                      onSuccess: (membership) =>
                        expect(membership).toMatchObject({
                          organizationId,
                          personId: context.personId,
                          accessLevel: context.invitation.accessLevel,
                        }),
                      onFailure: (error) =>
                        expect(error).toMatchObject({
                          _tag: "OrganizationInvitationExpiredError",
                          organizationId,
                        }),
                    })

                    const persisted = Option.getOrThrow(
                      yield* organizations.findInvitation({
                        organizationId,
                        email: context.invitation.email,
                      }),
                    )

                    expect(persisted).toEqual({
                      ...context.invitation,
                      status: outcome === "accepted" ? "ACCEPTED" : "EXPIRED",
                      updatedAt: yield* DateTime.now,
                    })

                    const membership = yield* organizations.findMembership({
                      organizationId,
                      personId: context.personId,
                    })
                    expect(Option.isSome(membership)).toBe(outcome === "accepted")
                    return context
                  }),
              }),
            ),
        })

        const deniedInvitation = () => runSteps(tryInvitation(), accessDenied())
        Scenario("Non-members can't invite people to an organization", {
          layer: OrganizationsFeatureTestLayer,
          steps: deniedInvitation,
        })
        Scenario("Can't invite people without community access", {
          layer: OrganizationsFeatureTestLayer,
          steps: deniedInvitation,
        })
        Scenario("Can't invite blocked people", {
          layer: OrganizationsFeatureTestLayer,
          steps: deniedInvitation,
        })

        Scenario("Can't invite invalid people", {
          layer: OrganizationsFeatureTestLayer,
          steps: () =>
            runSteps(
              tryInvitation(),
              Then("the invitation fails because the person does not exist", {
                handler: (context) =>
                  Effect.sync(() => {
                    expect(context.error).toMatchObject({ _tag: "PersonNotFoundError" })
                    return context
                  }),
              }),
              And("no invitation is created", {
                handler: (context) =>
                  Effect.gen(function* () {
                    const organizations = yield* OrganizationsRepository
                    expect(yield* organizations.listInvitations(context.organizationId)).toEqual(
                      context.invitationsBefore,
                    )
                    return context
                  }),
              }),
            ),
        })
      },
    )

    Rule("Managers handle organization memberships", ({ Background, Scenario }) => {
      Background({
        layer: OrganizationsFeatureTestLayer,
        steps: () => runSteps(givenPeople(), givenOrganization(), givenMemberships()),
      })

      Scenario("Manager promotes member to EDITOR", {
        layer: OrganizationsFeatureTestLayer,
        steps: () =>
          runSteps(
            When(
              "{string:actor} promotes {string:target} to {string:role} in {string:organization}",
              {
                params: Schema.Struct({ ...Invitation.fields, role: OrganizationAccessLevel }),
                handler: (_, { actor, target, role, organization }) =>
                  Effect.gen(function* () {
                    const context = yield* background()
                    const service = yield* OrganizationsService

                    yield* withPerson(
                      service.updateMemberRole({
                        organizationId: organizationNamed(context, organization),
                        personId: personNamed(context.actors, target),
                        accessLevel: role,
                      }),
                      personNamed(context.actors, actor),
                    )

                    return context
                  }),
              },
            ),
            membershipIsEditor(),
          ),
      })

      Scenario("Non-MANAGER member cannot change organization access levels", {
        layer: OrganizationsFeatureTestLayer,
        steps: () =>
          runSteps(
            When(
              "{string:actor} tries to change {string:target}'s organization access level in {string:organization}",
              {
                params: Invitation,
                handler: (_, { actor, target, organization }) =>
                  Effect.gen(function* () {
                    const context = yield* background()
                    const service = yield* OrganizationsService

                    return yield* deniedAction(
                      withPerson(
                        service.updateMemberRole({
                          organizationId: organizationNamed(context, organization),
                          personId: personNamed(context.actors, target),
                          accessLevel: "EDITOR",
                        }),
                        personNamed(context.actors, actor),
                      ),
                      {
                        context,
                        readAffected: OrganizationsRepository.use((organizations) =>
                          organizations.findMembership({
                            organizationId: organizationNamed(context, organization),
                            personId: personNamed(context.actors, target),
                          }),
                        ),
                      },
                    )
                  }),
              },
            ),
            accessDenied(),
          ),
      })

      Scenario("Manager removes another member", {
        layer: OrganizationsFeatureTestLayer,
        steps: () =>
          runSteps(
            When("{string:actor} removes {string:target} from {string:organization}", {
              params: Invitation,
              handler: (_, { actor, target, organization }) =>
                Effect.gen(function* () {
                  const context = yield* background()
                  const service = yield* OrganizationsService

                  yield* withPerson(
                    service.removeMember(
                      organizationNamed(context, organization),
                      personNamed(context.actors, target),
                    ),
                    personNamed(context.actors, actor),
                  )

                  return context
                }),
            }),
            noMembership(),
          ),
      })

      Scenario("Cannot remove the last MANAGER", {
        layer: OrganizationsFeatureTestLayer,
        steps: () =>
          runSteps(
            Given("{string:name} is removed from {string:organization}", {
              params: ActorOrganization,
              handler: (_, { name, organization }) =>
                Effect.gen(function* () {
                  const context = yield* background()
                  const service = yield* OrganizationsService
                  yield* withPerson(
                    service.leaveOrganization(organizationNamed(context, organization)),
                    personNamed(context.actors, name),
                  )
                  return context
                }),
            }),
            And("{string:name} is the only MANAGER of {string:organization}", {
              params: ActorOrganization,
              handler: (context, { name, organization }) =>
                Effect.gen(function* () {
                  const service = yield* OrganizationsService
                  const members = yield* withPerson(
                    service.listMembers(organizationNamed(context, organization)),
                    personNamed(context.actors, name),
                  )

                  expect(
                    members
                      .filter((member) => member.accessLevel === "MANAGER")
                      .map((member) => member.personId),
                  ).toEqual([personNamed(context.actors, name)])

                  return context
                }),
            }),
            When("{string:name} tries to leave {string:organization}", {
              params: ActorOrganization,
              handler: (context, { name, organization }) =>
                Effect.gen(function* () {
                  const service = yield* OrganizationsService
                  const organizationId = organizationNamed(context, organization)

                  const denied = yield* deniedAction(
                    withPerson(
                      service.leaveOrganization(organizationId),
                      personNamed(context.actors, name),
                    ),
                    {
                      context,
                      readAffected: OrganizationsRepository.use((organizations) =>
                        organizations.listMembers(organizationId),
                      ),
                    },
                  )

                  return { ...denied, organizationId }
                }),
            }),
            Then("access is denied", {
              handler: (context) =>
                Effect.sync(() => {
                  expect(context.error).toMatchObject({
                    _tag: "LastManagerCannotLeaveError",
                    organizationId: context.organizationId,
                  })
                  return context
                }),
            }),
          ),
      })

      Scenario("Manager can leave if another manager exists", {
        layer: OrganizationsFeatureTestLayer,
        steps: () => runSteps(leave(), noMembership(), membershipRemains()),
      })
    })

    Rule(
      "Organizations can be deleted by manager organization members",
      ({ Background, Scenario }) => {
        Background({
          layer: OrganizationsFeatureTestLayer,
          steps: () => runSteps(givenPeople(), givenOrganization(), givenMemberships()),
        })

        Scenario("Manager deletes the organization", {
          layer: OrganizationsFeatureTestLayer,
          steps: () =>
            runSteps(
              When("{string:name} deletes the organization {string:organization}", {
                params: ActorOrganization,
                handler: (_, { name, organization }) =>
                  Effect.gen(function* () {
                    const context = yield* background()
                    const service = yield* OrganizationsService
                    yield* withPerson(
                      service.deleteOrganization(organizationNamed(context, organization)),
                      personNamed(context.actors, name),
                    )
                    return context
                  }),
              }),
              Then("the organization {string:organization} no longer exists", {
                params: NamedOrganization,
                handler: (context, { organization }) =>
                  Effect.gen(function* () {
                    const organizations = yield* OrganizationsRepository
                    const profiles = yield* ProfileService
                    const organizationId = organizationNamed(context, organization)
                    expect(Option.isNone(yield* organizations.findById(organizationId))).toBe(true)

                    expect(
                      Option.isNone(
                        yield* withSession(profiles.findById(organizationId), VISITOR_SESSION),
                      ),
                    ).toBe(true)

                    expect(yield* organizations.listMembers(organizationId)).toEqual([])

                    expect(yield* organizations.listInvitations(organizationId)).toEqual([])

                    return context
                  }),
              }),
            ),
        })

        Scenario("Non-manager cannot delete the organization", {
          layer: OrganizationsFeatureTestLayer,
          steps: () =>
            runSteps(
              When("{string:name} tries to delete the organization {string:organization}", {
                params: ActorOrganization,
                handler: (_, { name, organization }) =>
                  Effect.gen(function* () {
                    const context = yield* background()
                    const service = yield* OrganizationsService

                    return yield* deniedAction(
                      withPerson(
                        service.deleteOrganization(organizationNamed(context, organization)),
                        personNamed(context.actors, name),
                      ),
                      {
                        context,
                        readAffected: OrganizationsRepository.use((organizations) =>
                          Effect.all(
                            {
                              organization: organizations.findById(
                                organizationNamed(context, organization),
                              ),
                              members: organizations.listMembers(
                                organizationNamed(context, organization),
                              ),
                              invitations: organizations.listInvitations(
                                organizationNamed(context, organization),
                              ),
                              profile: ProfilesRepository.use((profiles) =>
                                profiles.findById(organizationNamed(context, organization)),
                              ),
                            },
                            { concurrency: 1 },
                          ),
                        ),
                      },
                    )
                  }),
              }),
              accessDenied(),
            ),
        })
      },
    )

    Rule(
      "Organizations control the visibility of their members list",
      ({ Background, Scenario }) => {
        Background({
          layer: OrganizationsFeatureTestLayer,
          steps: () => runSteps(givenPeople(), givenOrganization(), givenMembers()),
        })

        const visibilitySteps = () =>
          runSteps(
            Given("{string:organization} only displays members in {string:visibility}", {
              params: Schema.Struct({
                ...NamedOrganization.fields,
                visibility: InformationVisibility,
              }),
              handler: (_, { organization, visibility }) =>
                Effect.gen(function* () {
                  const context = yield* background()
                  const service = yield* OrganizationsService
                  const organizations = yield* OrganizationsRepository
                  const organizationId = organizationNamed(context, organization)
                  const manager = (yield* organizations.listMembers(organizationId)).find(
                    (member) => member.accessLevel === "MANAGER",
                  )
                  const managerId = Option.getOrThrow(Option.fromNullishOr(manager?.personId))
                  yield* withPerson(
                    service.updateOrganization(organizationId, { membersVisibility: visibility }),
                    managerId,
                  )
                  const expectedMembers = yield* organizations.listMembers(organizationId)
                  return { ...context, expectedMembers }
                }),
            }),
            Then("{string:organization} members list should have the following accessibility:", {
              params: Schema.Struct({
                ...NamedOrganization.fields,
                table: Schema.Array(
                  Schema.Struct({
                    viewer: Schema.String,
                    can_access: Schema.Literals(["yes", "no"]),
                  }),
                ),
              }),
              handler: (context, { organization, table }) =>
                Effect.gen(function* () {
                  const service = yield* OrganizationsService

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

                        const result = yield* withSession(
                          service.listMembers(organizationNamed(context, organization)),
                          session,
                        ).pipe(Effect.result)
                        expect(Result.isSuccess(result), `${viewer} member-list access`).toBe(
                          canAccess === "yes",
                        )

                        Result.match(result, {
                          onSuccess: (members) => expect(members).toEqual(context.expectedMembers),
                          onFailure: (error) =>
                            expect(error).toMatchObject({ _tag: "UnauthorizedError" }),
                        })
                      }),
                    { concurrency: 1 },
                  )

                  return context
                }),
            }),
          )

        Scenario("Organization hides members from people outside the organization", {
          layer: OrganizationsFeatureTestLayer,
          steps: visibilitySteps,
        })
        Scenario("Organization only shows members to the community", {
          layer: OrganizationsFeatureTestLayer,
          steps: visibilitySteps,
        })
        Scenario("Organization only shows members to the public", {
          layer: OrganizationsFeatureTestLayer,
          steps: visibilitySteps,
        })
      },
    )
  }).pipe(Effect.provide(NodeServices.layer)),
)

it.effect("organization profile edits require a trusted manager at both service boundaries", () =>
  assertPropertyEffect({
    arbitrary: Arbitrary.schema(
      Schema.Struct({
        role: OrganizationAccessLevel,
        accessLevel: Schema.Union([TrustedAccessLevel, Schema.Literal("BLOCKED")]),
      }),
    ),
    options: { runs: 30 },
    predicate: ({ role, accessLevel }) =>
      Effect.gen(function* () {
        const context = yield* provisionPeople([{ name: "Member", accessLevel: "COMMUNITY" }])
        const personId = personNamed(context.actors, "Member")
        const service = yield* OrganizationsService
        const profiles = yield* ProfileService
        const people = yield* PeopleService
        const organization = yield* createNamedOrganization({
          name: "Collective",
          personId: context.administratorId,
        })
        yield* withPerson(
          service.inviteMember({ organizationId: organization.id, personId, accessLevel: role }),
          context.administratorId,
        )
        yield* withPerson(service.acceptInvitation(organization.id), personId)
        yield* withPerson(people.setAccessLevel(personId, accessLevel), context.administratorId)
        const allowed = role === "MANAGER" && Schema.is(TrustedAccessLevel)(accessLevel)

        const checkEdit = <A, E, R>(action: Effect.Effect<A, E, R>) =>
          Effect.gen(function* () {
            const before = yield* withSession(profiles.findById(organization.id), VISITOR_SESSION)
            const result = yield* withPerson(action, personId).pipe(Effect.result)
            expect(Result.isSuccess(result)).toBe(allowed)

            yield* Result.match(result, {
              onSuccess: () => Effect.void,
              onFailure: (error) =>
                Effect.gen(function* () {
                  expect(error).toMatchObject({ _tag: "UnauthorizedError" })
                  expect(
                    yield* withSession(profiles.findById(organization.id), VISITOR_SESSION),
                  ).toEqual(before)
                }),
            })
          })

        yield* checkEdit(
          service.updateOrganization(organization.id, { name: "Changed by organization service" }),
        )
        yield* checkEdit(
          profiles.updateProfile(organization.id, { name: "Changed by profile service" }),
        )
        return true
      }).pipe(Effect.provide(OrganizationsFeatureTestLayer)),
  }),
)

it.effect("last-manager protection covers removal and every role demotion", () =>
  Effect.gen(function* () {
    const context = yield* provisionPeople([{ name: "Manager", accessLevel: "COMMUNITY" }])
    const personId = personNamed(context.actors, "Manager")
    const organization = yield* createNamedOrganization({ name: "Collective", personId })
    const service = yield* OrganizationsService
    const organizations = yield* OrganizationsRepository
    const before = yield* organizations.findMembership({
      organizationId: organization.id,
      personId,
    })

    const actions = [
      service.removeMember(organization.id, personId),
      service.leaveOrganization(organization.id),
      ...OrganizationAccessLevel.literals
        .filter((role) => role !== "MANAGER")
        .map((accessLevel) =>
          service.updateMemberRole({ organizationId: organization.id, personId, accessLevel }),
        ),
    ]

    yield* Effect.forEach(
      actions,
      (action) =>
        Effect.gen(function* () {
          expect(yield* withPerson(action, personId).pipe(Effect.flip)).toMatchObject({
            _tag: "LastManagerCannotLeaveError",
            organizationId: organization.id,
          })
          expect(
            yield* organizations.findMembership({ organizationId: organization.id, personId }),
          ).toEqual(before)
        }),
      { concurrency: 1 },
    )
  }).pipe(Effect.provide(OrganizationsFeatureTestLayer)),
)

it.effect("only the trusted invitee can accept a pending invitation, once", () =>
  Effect.gen(function* () {
    const context = yield* provisionPeople([
      { name: "Manager", accessLevel: "COMMUNITY" },
      { name: "Invitee", accessLevel: "COMMUNITY" },
      { name: "Other person", accessLevel: "COMMUNITY" },
    ])

    const managerId = personNamed(context.actors, "Manager")
    const inviteeId = personNamed(context.actors, "Invitee")
    const otherId = personNamed(context.actors, "Other person")
    const organization = yield* createNamedOrganization({ name: "Collective", personId: managerId })
    const service = yield* OrganizationsService
    const people = yield* PeopleService

    const invitation = yield* withPerson(
      service.inviteMember({
        organizationId: organization.id,
        personId: inviteeId,
        accessLevel: "VIEWER",
      }),
      managerId,
    )

    const organizations = yield* OrganizationsRepository

    const readAcceptance = () =>
      Effect.all(
        {
          invitation: organizations.findInvitation({
            organizationId: organization.id,
            email: invitation.email,
          }),
          membership: organizations.findMembership({
            organizationId: organization.id,
            personId: inviteeId,
          }),
          otherMembership: organizations.findMembership({
            organizationId: organization.id,
            personId: otherId,
          }),
        },
        { concurrency: 1 },
      )

    const before = yield* readAcceptance()
    expect(
      yield* withPerson(service.acceptInvitation(organization.id), otherId).pipe(Effect.flip),
    ).toMatchObject({ _tag: "OrganizationInvitationNotFoundError" })
    expect(yield* readAcceptance()).toEqual(before)

    yield* withPerson(people.setAccessLevel(inviteeId, "BLOCKED"), context.administratorId)
    expect(
      yield* withPerson(service.acceptInvitation(organization.id), inviteeId).pipe(Effect.flip),
    ).toMatchObject({ _tag: "UnauthorizedError" })
    expect(yield* readAcceptance()).toEqual(before)

    yield* withPerson(people.setAccessLevel(inviteeId, "COMMUNITY"), context.administratorId)
    yield* withPerson(service.acceptInvitation(organization.id), inviteeId)
    const accepted = yield* readAcceptance()
    expect(
      yield* withPerson(service.acceptInvitation(organization.id), inviteeId).pipe(Effect.flip),
    ).toMatchObject({ _tag: "OrganizationInvitationNotFoundError" })
    expect(yield* readAcceptance()).toEqual(accepted)
  }).pipe(Effect.provide(OrganizationsFeatureTestLayer)),
)

it.effect("managers can renew expired invitations before or after an acceptance attempt", () =>
  Effect.gen(function* () {
    const context = yield* provisionPeople([
      { name: "Manager", accessLevel: "COMMUNITY" },
      { name: "Invitee", accessLevel: "COMMUNITY" },
    ])
    const managerId = personNamed(context.actors, "Manager")
    const personId = personNamed(context.actors, "Invitee")
    const service = yield* OrganizationsService
    const organizations = yield* OrganizationsRepository

    yield* Effect.forEach(
      [false, true],
      (attemptAcceptance) =>
        Effect.gen(function* () {
          const organization = yield* createNamedOrganization({
            name: "Collective",
            personId: managerId,
          })

          const invitation = yield* withPerson(
            service.inviteMember({
              organizationId: organization.id,
              personId,
              accessLevel: "VIEWER",
            }),
            managerId,
          )

          const readInvitation = organizations.findInvitation({
            organizationId: organization.id,
            email: invitation.email,
          })

          expect(
            yield* withPerson(
              service.inviteMember({
                organizationId: organization.id,
                personId,
                accessLevel: "EDITOR",
              }),
              managerId,
            ).pipe(Effect.flip),
          ).toMatchObject({ _tag: "UnauthorizedError" })

          expect(Option.getOrThrow(yield* readInvitation)).toEqual(invitation)
          yield* TestClock.setTime(
            DateTime.toEpochMillis(DateTime.add(invitation.createdAt, { weeks: 2 })),
          )

          yield* attemptAcceptance
            ? withPerson(service.acceptInvitation(organization.id), personId).pipe(
                Effect.flip,
                Effect.tap((error) =>
                  Effect.sync(() =>
                    expect(error).toMatchObject({ _tag: "OrganizationInvitationExpiredError" }),
                  ),
                ),
              )
            : Effect.void

          const renewed = yield* withPerson(
            service.inviteMember({
              organizationId: organization.id,
              personId,
              accessLevel: "EDITOR",
            }),
            managerId,
          )

          expect(renewed).toEqual({
            ...invitation,
            accessLevel: "EDITOR",
            createdAt: yield* DateTime.now,
            updatedAt: yield* DateTime.now,
          })

          expect(Option.getOrThrow(yield* readInvitation)).toEqual(renewed)
          yield* TestClock.setTime(
            DateTime.toEpochMillis(DateTime.add(renewed.createdAt, { days: 13 })),
          )
          expect(
            yield* withPerson(service.acceptInvitation(organization.id), personId),
          ).toMatchObject({ organizationId: organization.id, personId, accessLevel: "EDITOR" })

          expect(
            Option.getOrThrow(
              yield* organizations.findMembership({ organizationId: organization.id, personId }),
            ).accessLevel,
          ).toBe("EDITOR")
        }),
      { concurrency: 1 },
    )
  }).pipe(Effect.provide(OrganizationsFeatureTestLayer)),
)
