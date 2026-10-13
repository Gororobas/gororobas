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
  UnauthorizedError,
  Policies,
  type PlatformAccessLevel,
} from "@gororobas/domain"
import { Array as EffectArray, DateTime, Effect, Option, Context, Match } from "effect"
import { SqlClient } from "effect/sql"

import { MediaDeletionWorkflow } from "../media-assets/media-deletion-workflow.js"
import { OrganizationsRepository } from "../organizations/repository.js"
import { ProfilesRepository } from "../profiles/repository.js"
import { PeopleRepository } from "./repository.js"

export class PeopleService extends Context.Service<PeopleService>()("PeopleService", {
  make: Effect.gen(function* () {
    const repo = yield* PeopleRepository
    const organizationsRepository = yield* OrganizationsRepository
    const profilesRepo = yield* ProfilesRepository
    const sql = yield* SqlClient.SqlClient

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

        if (currentRow.accessLevel === "ADMIN" && newAccessLevel !== "ADMIN") {
          const { count } = yield* repo.countOtherAdministrators(personId)

          if (count === 0) {
            return yield* new UnauthorizedError({
              message: "Cannot demote the last administrator",
              session: currentSession,
            })
          }
        }

        const now = yield* DateTime.now

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
        const orgsWhereSoleManager =
          yield* organizationsRepository.findOrganizationsWhereSoleManager(session.personId)
        const orgsWithOtherMembers = orgsWhereSoleManager.filter((org) => org.memberCount > 1)

        // 1.1. Prohibit if these orgs have 2+ members
        if (EffectArray.isReadonlyArrayNonEmpty(orgsWithOtherMembers)) {
          return yield* new AccountDeletionError({
            reason: AccountDeletionErrorReason.make({
              organizations: orgsWithOtherMembers.map((o) => o.organizationId),
            }),
          })
        }

        // 1.2. Ask for confirmation if they have a single member (the user to be deleted)
        if (
          confirmation?.shouldDeleteOrgs !== true &&
          EffectArray.isReadonlyArrayNonEmpty(orgsWhereSoleManager)
        ) {
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

        if (confirmation?.shouldDeleteContent !== true) {
          return AccountDeletionResultConfirmContentDeletion.make({
            personalContentCount,
            organizationContent,
          })
        }

        /**
         * 3. FINALLY DELETING EVERYTHING
         */
        const deletedMedia = yield* Effect.forEach(
          [
            session.personId,
            ...orgsWhereSoleManager.map((organization) => organization.organizationId),
          ],
          (profileId) => profilesRepo.deleteProfileReturningMediaAssets(profileId),
          { concurrency: 1 },
        )

        return {
          ...AccountDeletionResultSuccess.make({}),
          mediaAssetIds: deletedMedia.flat().map(({ mediaAssetId }) => mediaAssetId),
        }
      }).pipe(
        sql.withTransaction,
        // File deletion starts after commit so a rollback cannot remove files.
        Effect.flatMap((result) =>
          Match.value(result).pipe(
            Match.tag("Success", ({ mediaAssetIds }) =>
              EffectArray.match(mediaAssetIds, {
                onEmpty: () => Effect.void,
                onNonEmpty: (mediaAssetIds) =>
                  MediaDeletionWorkflow.execute({ mediaAssetIds }, { discard: true }),
              }).pipe(Effect.as(AccountDeletionResultSuccess.make({}))),
            ),
            Match.orElse((result) => Effect.succeed(result)),
          ),
        ),
        Effect.uninterruptible,
      )

    return {
      deleteCurrentPerson,
      setAccessLevel,
    } as const
  }),
}) {}
