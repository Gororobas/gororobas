import {
  AccountDeletionConfirmation,
  AccountDeletionError,
  AccountDeletionErrorReason,
  AccountDeletionResultConfirmContentDeletion,
  AccountDeletionResultConfirmOrgDeletion,
  AccountDeletionResultSuccess,
  OrganizationContentCount,
  PersonId,
  PersonNotFoundError,
  Policies,
  ProfileRowUpdate,
  type PlatformAccessLevel,
} from "@gororobas/domain"
import { HandleTakenError } from "@gororobas/domain/common/errors"
import { DateTime, Effect, Option } from "effect"
import { SqlClient } from "effect/unstable/sql"

import { ProfilesRepository } from "../profiles/repository.js"
import { PeopleRepository } from "./repository.js"

export class People extends Effect.Service<People>()("People", {
  dependencies: [PeopleRepository.Default],
  effect: Effect.gen(function* () {
    const repo = yield* PeopleRepository
    const profilesRepo = yield* ProfilesRepository
    const sql = yield* SqlClient.SqlClient

    const updateProfile = (personId: PersonId, data: ProfileRowUpdate) =>
      Effect.gen(function* () {
        if (data.handle !== undefined) {
          const inUse = yield* profilesRepo.isHandleInUse(data.handle)
          if (inUse) {
            return yield* new HandleTakenError({ handle: data.handle, entity: "profile" })
          }
        }

        return yield* profilesRepo.updateProfileRow({
          id: personId,
          ...data,
          updatedAt: yield* DateTime.nowAsDate,
        })
      })

    const setAccessLevel = (personId: PersonId, newAccessLevel: PlatformAccessLevel) =>
      Effect.gen(function* () {
        const currentRow = yield* repo.findById(personId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PersonNotFoundError({ id: personId })),
              onSome: Effect.succeed,
            }),
          ),
        )
        yield* Policies.people.canModifyAccessLevel({
          from: currentRow.accessLevel,
          to: newAccessLevel,
        })

        const currentSession = yield* Policies.common.assertAuthenticated
        const now = yield* DateTime.nowAsDate

        yield* repo.updateRow({
          id: personId,
          accessLevel: newAccessLevel,
          accessSetAt: now,
          accessSetById: currentSession.personId,
        })

        return
      }).pipe(sql.withTransaction)

    const deleteCurrentPerson = (confirmation?: AccountDeletionConfirmation) =>
      Effect.gen(function* () {
        const session = yield* Policies.common.assertAuthenticated

        /**
         * 1. IN CASE OF BEING THE SOLE MANAGER OF AN ORG
         */
        const orgsWhereSoleManager = yield* repo.findOrganizationsWhereSoleManager(session.personId)
        const orgsWithOtherMembers = orgsWhereSoleManager.filter((org) => org.memberCount > 1)

        // 1.1. Prohibit if these orgs have 2+ members
        if (orgsWithOtherMembers.length > 0) {
          return yield* new AccountDeletionError({
            reason: AccountDeletionErrorReason.make({
              organizations: orgsWithOtherMembers.map((o) => o.organizationId),
            }),
          })
        }

        // 1.2. Ask for confirmation if they have a single member (the user to be deleted)
        if (confirmation?.deleteOrgs !== true && orgsWhereSoleManager.length > 1) {
          return AccountDeletionResultConfirmOrgDeletion.make({
            organizations: orgsWhereSoleManager.map((o) => o.organizationId),
          })
        }

        /**
         * 2. CONFIRMING DELETION OF ALL CONTENT
         */
        const [personalContentCount, organizationContent] = yield* Effect.all(
          [
            // Personal
            profilesRepo.fetchProfileContentCounts(session.personId),

            // Per organization
            Effect.forEach(
              orgsWhereSoleManager,
              (org) =>
                profilesRepo.fetchProfileContentCounts(org.organizationId).pipe(
                  Effect.map((contentCount) =>
                    OrganizationContentCount.make({
                      organizationId: org.organizationId,
                      contentCount,
                    }),
                  ),
                ),
              { concurrency: "unbounded" },
            ),
          ],
          { concurrency: "unbounded" },
        )
        if (confirmation?.deleteContent !== true) {
          return AccountDeletionResultConfirmContentDeletion.make({
            personalContentCount,
            organizationContent,
          })
        }

        /**
         * 3. FINALLY DELETING EVERYTHING
         */
        yield* Effect.all(
          [
            // Personal
            profilesRepo.delete(session.personId),

            // Deleting all organizations where sole manager
            Effect.forEach(orgsWhereSoleManager, (org) => profilesRepo.delete(org.organizationId), {
              concurrency: "unbounded",
            }),
          ],
          { concurrency: "unbounded" },
        )

        return AccountDeletionResultSuccess.make({})
      }).pipe(sql.withTransaction)

    return {
      deleteCurrentPerson,
      setAccessLevel,
      updateProfile,
    } as const
  }),
}) {}

export const PeopleLive = People.Default
