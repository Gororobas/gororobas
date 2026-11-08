import {
  AccountDeletionConfirmation,
  AccountDeletionError,
  AccountDeletionResultConfirmContentDeletion,
  AccountDeletionResultConfirmOrgDeletion,
  AccountDeletionResultSuccess,
  AccountDeletionResult,
  type MediaAssetId,
  AccountDeletionScope,
  isSameAccountDeletionScope,
  isSameOrganizationSet,
  LastAdministrator,
  PersonId,
  PersonNotFoundError,
  type PersonRow,
  SoleOrgManager,
  UnauthorizedError,
  Policies,
  type PlatformAccessLevel,
  type MyAccountUpdate,
} from "@gororobas/domain"
import { Array as EffectArray, DateTime, Effect, Option, Context } from "effect"
import { SqlClient } from "effect/sql"

import { OrganizationsRepository } from "../organizations/repository.js"
import { deleteProfilesWithMedia } from "../profiles/profile-deletion.js"
import { ProfilesRepository } from "../profiles/repository.js"
import { PeopleRepository } from "./repository.js"

/** @effect-expect-leaking SqlClient */
export class PeopleService extends Context.Service<PeopleService>()("PeopleService", {
  make: Effect.gen(function* () {
    const repo = yield* PeopleRepository
    const organizationsRepository = yield* OrganizationsRepository
    const profilesRepo = yield* ProfilesRepository
    const sql = yield* SqlClient.SqlClient

    /** Losing this person's access would leave the community without administrative control. */
    const isLastAdministrator = (person: Pick<PersonRow, "id" | "accessLevel">) =>
      person.accessLevel === "ADMIN"
        ? repo.countOtherAdministrators(person.id).pipe(Effect.map(({ count }) => count === 0))
        : Effect.succeed(false)

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

        if (newAccessLevel !== "ADMIN" && (yield* isLastAdministrator(currentRow))) {
          return yield* new UnauthorizedError({
            message: "Cannot demote the last administrator",
            session: currentSession,
          })
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
      deleteProfilesWithMedia((deleteProfiles) =>
        Effect.gen(function* () {
          const session = yield* Policies.common.assertAuthenticated

          /**
           * 0. THE COMMUNITY KEEPS AN ADMINISTRATOR, like in `setAccessLevel`
           */
          const person = yield* repo.findById(session.personId)
          if (Option.isSome(person) && (yield* isLastAdministrator(person.value))) {
            return yield* new AccountDeletionError({ reason: LastAdministrator.make({}) })
          }

          /**
           * 1. IN CASE OF BEING THE SOLE MANAGER OF AN ORG
           */
          const orgsWhereSoleManager =
            yield* organizationsRepository.findOrganizationsWhereSoleManager(session.personId)
          const orgsWithOtherMembers = orgsWhereSoleManager.filter((org) => org.memberCount > 1)

          // 1.1. Prohibit if these orgs have 2+ members
          if (EffectArray.isReadonlyArrayNonEmpty(orgsWithOtherMembers)) {
            return yield* new AccountDeletionError({
              reason: SoleOrgManager.make({
                organizations: orgsWithOtherMembers.map((o) => o.organizationId),
              }),
            })
          }

          const organizationsToDelete = orgsWhereSoleManager.map(
            ({ organizationId, name, handle }) => ({ organizationId, name, handle }),
          )

          // 1.2. Ask for confirmation if they have a single member (the user to be deleted)
          if (
            EffectArray.isReadonlyArrayNonEmpty(organizationsToDelete) &&
            !isSameOrganizationSet(confirmation?.organizationIds ?? [], organizationsToDelete)
          ) {
            return {
              result: AccountDeletionResultConfirmOrgDeletion.make({
                organizations: organizationsToDelete,
              }),
              orphanedMedia: [],
            }
          }

          /**
           * 2. CONFIRMING DELETION OF ALL CONTENT, exactly as they reviewed it
           */
          const scope = AccountDeletionScope.make({
            personalContent: yield* profilesRepo.fetchProfileContent(session.personId),
            organizations: yield* Effect.forEach(
              organizationsToDelete,
              (organization) =>
                profilesRepo
                  .fetchProfileContent(organization.organizationId)
                  .pipe(Effect.map((content) => ({ ...organization, content }))),
              { concurrency: 1 },
            ),
          })

          if (
            confirmation?.scope === undefined ||
            !isSameAccountDeletionScope(confirmation.scope, scope)
          ) {
            return {
              result: AccountDeletionResultConfirmContentDeletion.make(scope),
              orphanedMedia: [],
            }
          }

          /**
           * 3. FINALLY DELETING EVERYTHING
           */
          const orphanedMedia = yield* deleteProfiles([
            session.personId,
            ...orgsWhereSoleManager.map((organization) => organization.organizationId),
          ])

          return { result: AccountDeletionResultSuccess.make({}), orphanedMedia }
        }).pipe(
          Effect.map(
            (
              value,
            ): {
              result: typeof AccountDeletionResult.Type
              orphanedMedia: ReadonlyArray<MediaAssetId>
            } => value,
          ),
        ),
      )

    const getCurrentAccount = Effect.gen(function* () {
      const session = yield* Policies.common.assertAuthenticated
      const account = yield* repo.findAccount(session.personId)
      if (Option.isNone(account)) {
        return yield* new PersonNotFoundError({ id: session.personId })
      }
      return account.value
    })

    const updateCurrentAccount = (update: MyAccountUpdate) =>
      Effect.gen(function* () {
        const session = yield* Policies.common.assertAuthenticated
        yield* repo.updateRow({ id: session.personId, ...update })
      })

    return {
      deleteCurrentPerson,
      getCurrentAccount,
      setAccessLevel,
      updateCurrentAccount,
    } as const
  }),
}) {}
