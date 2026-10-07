import {
  CreateOrganizationData,
  IdGen,
  LastManagerCannotLeaveError,
  OrganizationAccessLevel,
  OrganizationId,
  OrganizationInvitationId,
  OrganizationInvitationRow,
  OrganizationInvitationExpiredError,
  OrganizationInvitationNotFoundError,
  OrganizationMembershipNotFoundError,
  OrganizationNotFoundError,
  PersonId,
  PersonNotFoundError,
  Policies,
  TrustedAccessLevel,
  UnauthorizedError,
  UpdateOrganizationData,
} from "@gororobas/domain"
import { HandleTakenError } from "@gororobas/domain/common/errors"
import { Context, DateTime, Effect, Option, Result, Schema } from "effect"
import { SqlClient } from "effect/sql"

import { PeopleRepository } from "../people/repository.js"
import { ProfilesRepository } from "../profiles/repository.js"
import { OrganizationsRepository } from "./repository.js"

const invitationHasExpired = (invitation: OrganizationInvitationRow, now: DateTime.Utc) =>
  DateTime.Order(now, DateTime.add(invitation.createdAt, { weeks: 2 })) >= 0

export class OrganizationsService extends Context.Service<OrganizationsService>()(
  "OrganizationsService",
  {
    make: Effect.gen(function* () {
      const organizations = yield* OrganizationsRepository
      const profiles = yield* ProfilesRepository
      const people = yield* PeopleRepository
      const sql = yield* SqlClient.SqlClient

      const requireOrganization = (organizationId: OrganizationId) =>
        organizations.findById(organizationId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new OrganizationNotFoundError({ id: organizationId })),
              onSome: Effect.succeed,
            }),
          ),
        )

      const requireMembership = (organizationId: OrganizationId, personId: PersonId) =>
        organizations.findMembership({ organizationId, personId }).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.fail(new OrganizationMembershipNotFoundError({ organizationId, personId })),
              onSome: Effect.succeed,
            }),
          ),
        )

      const requirePersonEmail = (personId: PersonId) =>
        organizations.findPersonEmail(personId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PersonNotFoundError({ id: personId })),
              onSome: ({ email }) => Effect.succeed(email),
            }),
          ),
        )

      const deny = (message: string) =>
        Policies.common.assertAuthenticated.pipe(
          Effect.flatMap((session) => Effect.fail(new UnauthorizedError({ message, session }))),
        )

      const requireTrustedInvitee = (personId: PersonId) =>
        Effect.gen(function* () {
          const person = yield* people.findById(personId)
          if (Option.isNone(person)) return yield* new PersonNotFoundError({ id: personId })
          if (!Schema.is(TrustedAccessLevel)(person.value.accessLevel)) {
            return yield* deny("Invitee must have community access")
          }
        })

      const protectLastManager = (organizationId: OrganizationId, personId: PersonId) =>
        Effect.gen(function* () {
          const membership = yield* requireMembership(organizationId, personId)

          if (membership.accessLevel === "MANAGER") {
            const members = yield* organizations.listMembers(organizationId)

            if (
              !members.some(
                (member) => member.accessLevel === "MANAGER" && member.personId !== personId,
              )
            ) {
              return yield* new LastManagerCannotLeaveError({ organizationId })
            }
          }

          return membership
        })

      const createOrganization = (data: CreateOrganizationData) =>
        Effect.gen(function* () {
          yield* Policies.organizations.canCreate
          const session = yield* Policies.common.assertAuthenticated

          if (yield* profiles.isHandleInUse(data.handle)) {
            return yield* new HandleTakenError({ handle: data.handle, entity: "profile" })
          }

          const id = yield* IdGen.make(OrganizationId)
          const now = yield* DateTime.now

          yield* profiles.insertProfile({
            ...data,
            id,
            type: "ORGANIZATION",
            visibility: "PUBLIC",
            bio: null,
            location: null,
            photoId: null,
            createdAt: now,
            updatedAt: now,
          })

          yield* organizations.insertRow({ id, type: data.type, membersVisibility: "PUBLIC" })

          yield* organizations.insertMembership({
            organizationId: id,
            personId: session.personId,
            accessLevel: "MANAGER",
            createdAt: now,
            updatedAt: now,
          })

          return { id, handle: data.handle }
        }).pipe(sql.withTransaction)

      const updateOrganization = (organizationId: OrganizationId, data: UpdateOrganizationData) =>
        Effect.gen(function* () {
          yield* Policies.organizations.canEditProfile(organizationId)
          const organization = yield* requireOrganization(organizationId)

          if (data.name !== undefined) {
            yield* profiles.updateProfileRow({
              id: organizationId,
              name: data.name,
              updatedAt: yield* DateTime.now,
            })
          }

          if (data.membersVisibility !== undefined) {
            yield* Policies.organizations.canSetVisibility(organizationId)
            yield* organizations.updateRow({
              ...organization,
              membersVisibility: data.membersVisibility,
            })
          }

          return true as const
        }).pipe(sql.withTransaction)

      const inviteMember = ({
        organizationId,
        personId,
        accessLevel,
      }: {
        organizationId: OrganizationId
        personId: PersonId
        accessLevel: OrganizationAccessLevel
      }) =>
        Effect.gen(function* () {
          const session = yield* Policies.organizations.canInviteMember(organizationId)
          yield* requireOrganization(organizationId)
          yield* requireTrustedInvitee(personId)
          const email = yield* requirePersonEmail(personId)

          if (Option.isSome(yield* organizations.findMembership({ organizationId, personId }))) {
            return yield* deny("Person is already a member")
          }

          const existing = yield* organizations.findInvitation({ organizationId, email })
          const now = yield* DateTime.now

          if (
            Option.isSome(existing) &&
            !(
              existing.value.status === "EXPIRED" ||
              (existing.value.status === "PENDING" && invitationHasExpired(existing.value, now))
            )
          ) {
            return yield* deny("Person already has an invitation")
          }

          const invitation = {
            id: Option.isSome(existing)
              ? existing.value.id
              : yield* IdGen.make(OrganizationInvitationId),
            organizationId,
            email,
            accessLevel,
            status: "PENDING" as const,
            createdById: session.personId,
            createdAt: now,
            updatedAt: now,
          }

          yield* Option.isSome(existing)
            ? organizations.updateInvitation(invitation)
            : organizations.insertInvitation(invitation)
          return invitation
        }).pipe(sql.withTransaction)

      const acceptInvitation = (organizationId: OrganizationId) =>
        Effect.gen(function* () {
          const session = yield* Policies.common.assertTrustedPerson
          yield* requireOrganization(organizationId)
          const email = yield* requirePersonEmail(session.personId)
          const invitation = yield* organizations.findInvitation({ organizationId, email })

          if (Option.isNone(invitation) || invitation.value.status === "ACCEPTED") {
            return yield* new OrganizationInvitationNotFoundError({ organizationId })
          }

          const now = yield* DateTime.now

          if (
            invitation.value.status === "EXPIRED" ||
            invitationHasExpired(invitation.value, now)
          ) {
            if (invitation.value.status !== "EXPIRED") {
              yield* organizations.updateInvitation({
                ...invitation.value,
                status: "EXPIRED",
                updatedAt: now,
              })
            }

            // Return the rejection as a value so the transaction commits the EXPIRED status before failing.
            return Result.fail(new OrganizationInvitationExpiredError({ organizationId }))
          }

          if (
            Option.isSome(
              yield* organizations.findMembership({ organizationId, personId: session.personId }),
            )
          ) {
            return yield* deny("Person is already a member")
          }

          const membership = {
            organizationId,
            personId: session.personId,
            accessLevel: invitation.value.accessLevel,
            createdAt: now,
            updatedAt: now,
          }

          yield* organizations.insertMembership(membership)

          yield* organizations.updateInvitation({
            ...invitation.value,
            status: "ACCEPTED",
            updatedAt: now,
          })

          return Result.succeed(membership)
        }).pipe(sql.withTransaction, Effect.flatMap(Effect.fromResult))

      const updateMemberRole = ({
        organizationId,
        personId,
        accessLevel,
      }: {
        organizationId: OrganizationId
        personId: PersonId
        accessLevel: OrganizationAccessLevel
      }) =>
        Effect.gen(function* () {
          yield* Policies.organizations.canManageMemberPermissions(organizationId)
          yield* requireOrganization(organizationId)

          const membership = yield* accessLevel === "MANAGER"
            ? requireMembership(organizationId, personId)
            : protectLastManager(organizationId, personId)

          const updated = { ...membership, accessLevel, updatedAt: yield* DateTime.now }

          yield* organizations.updateMembership(updated)

          return updated
        }).pipe(sql.withTransaction)

      const removeMember = (organizationId: OrganizationId, personId: PersonId) =>
        Effect.gen(function* () {
          yield* Policies.organizations.canRemoveMember(organizationId)
          yield* requireOrganization(organizationId)
          yield* protectLastManager(organizationId, personId)
          yield* organizations.deleteMembership({ organizationId, personId })
        }).pipe(sql.withTransaction)

      const leaveOrganization = (organizationId: OrganizationId) =>
        Effect.gen(function* () {
          const session = yield* Policies.common.assertAuthenticated
          yield* Policies.organizations.canLeave(organizationId)
          yield* requireOrganization(organizationId)
          yield* protectLastManager(organizationId, session.personId)
          yield* organizations.deleteMembership({ organizationId, personId: session.personId })
        }).pipe(sql.withTransaction)

      const deleteOrganization = (organizationId: OrganizationId) =>
        Effect.gen(function* () {
          yield* Policies.organizations.canDelete(organizationId)
          yield* requireOrganization(organizationId)
          // Delete the owning profile so its content and organization dependencies cascade together.
          yield* profiles.delete(organizationId)
        }).pipe(sql.withTransaction)

      const listMembers = (organizationId: OrganizationId) =>
        Effect.gen(function* () {
          const organization = yield* requireOrganization(organizationId)
          yield* Policies.organizations.canViewMembers(organization)
          return yield* organizations.listMembers(organizationId)
        })

      return {
        createOrganization,
        updateOrganization,
        inviteMember,
        acceptInvitation,
        updateMemberRole,
        removeMember,
        leaveOrganization,
        deleteOrganization,
        listMembers,
      } as const
    }),
  },
) {}
