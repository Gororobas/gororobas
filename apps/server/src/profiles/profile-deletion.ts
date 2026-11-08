import { type MediaAssetId, type ProfileId } from "@gororobas/domain"
import { Array as EffectArray, Effect } from "effect"
import { SqlClient } from "effect/sql"

import { MediaDeletionWorkflow } from "../media-assets/media-deletion-workflow.js"
import { deleteProfileReturningMediaAssets } from "./mutations.js"

const deleteProfilesReturningMedia = (profileIds: ReadonlyArray<ProfileId>) =>
  Effect.forEach(profileIds, deleteProfileReturningMediaAssets, { concurrency: 1 }).pipe(
    Effect.map((deleted) => deleted.flat().map(({ mediaAssetId }) => mediaAssetId)),
  )

export type DeleteProfiles = typeof deleteProfilesReturningMedia

/**
 * The one way to delete people's and organizations' profiles, so their media files go with them.
 *
 * `transaction` runs in a SQL transaction and deletes profiles through `deleteProfiles`, which
 * returns the media files each profile owned along with its result. Once the transaction commits,
 * a media deletion workflow removes those files: starting it after commit keeps a rollback from removing the files
 * of rows that still exist. When this runs inside a request's write transaction, that's the
 * request's commit.
 */
export const deleteProfilesWithMedia = <A, E, R>(
  transaction: (
    deleteProfiles: DeleteProfiles,
  ) => Effect.Effect<{ result: A; orphanedMedia: ReadonlyArray<MediaAssetId> }, E, R>,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const { result, orphanedMedia } = yield* transaction(deleteProfilesReturningMedia)

        yield* EffectArray.match(orphanedMedia, {
          onEmpty: () => Effect.void,
          onNonEmpty: (mediaAssetIds) =>
            sql.afterCommit(
              MediaDeletionWorkflow.execute({ mediaAssetIds }, { discard: true }).pipe(
                Effect.asVoid,
                Effect.catchCause((cause) =>
                  Effect.logError("Starting the media deletion workflow failed", cause),
                ),
              ),
            ),
        })

        return result
      }),
    )
  }).pipe(Effect.uninterruptible)
