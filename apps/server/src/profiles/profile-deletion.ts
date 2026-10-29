import { type MediaAssetId, type ProfileId } from "@gororobas/domain"
import { Array as EffectArray, Effect, Ref } from "effect"
import { SqlClient } from "effect/sql"

import { MediaDeletionWorkflow } from "../media-assets/media-deletion-workflow.js"
import { deleteProfileReturningMediaAssets } from "./mutations.js"

/** Deletes profiles and adds the media files they owned to `orphanedMedia`. */
const deleteProfilesRecordingMedia =
  (orphanedMedia: Ref.Ref<ReadonlyArray<MediaAssetId>>) => (profileIds: ReadonlyArray<ProfileId>) =>
    Effect.forEach(profileIds, deleteProfileReturningMediaAssets, { concurrency: 1 }).pipe(
      Effect.flatMap((deleted) =>
        Ref.update(orphanedMedia, (recorded) => [
          ...recorded,
          ...deleted.flat().map(({ mediaAssetId }) => mediaAssetId),
        ]),
      ),
    )

export type DeleteProfiles = ReturnType<typeof deleteProfilesRecordingMedia>

/**
 * The one way to delete people's and organizations' profiles, so their media files go with them.
 *
 * `transaction` runs in a SQL transaction and deletes profiles through `deleteProfiles`, which
 * records the media files each profile owned. Once the transaction commits, a media deletion
 * workflow removes those files: starting it after commit keeps a rollback from removing the files
 * of rows that still exist.
 */
export const deleteProfilesWithMedia = <A, E, R>(
  transaction: (deleteProfiles: DeleteProfiles) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const orphanedMedia = yield* Ref.make<ReadonlyArray<MediaAssetId>>([])

    const result = yield* sql.withTransaction(
      transaction(deleteProfilesRecordingMedia(orphanedMedia)),
    )

    yield* EffectArray.match(yield* Ref.get(orphanedMedia), {
      onEmpty: () => Effect.void,
      onNonEmpty: (mediaAssetIds) =>
        MediaDeletionWorkflow.execute({ mediaAssetIds }, { discard: true }),
    })

    return result
  }).pipe(Effect.uninterruptible)
