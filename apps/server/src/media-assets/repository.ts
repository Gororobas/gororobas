import { Context, Effect } from "effect"

import {
  updateMediaAssetDescriptions,
  insertMediaAsset,
  insertMediaAssetCredit,
  insertMediaAssetImport,
} from "./mutations.js"
import {
  findMediaAssetById,
  findMediaAssetImportByUrl,
  findMediaAssetPublicationAccess,
  listMediaAssetWikiArticles,
  listMediaAssetProfiles,
} from "./queries.js"

/** @effect-expect-leaking SqlClient */
export class MediaAssetsRepository extends Context.Service<MediaAssetsRepository>()(
  "MediaAssetsRepository",
  {
    make: Effect.succeed({
      insertMediaAsset,
      updateMediaAssetDescriptions,
      findMediaAssetPublicationAccess,
      listMediaAssetWikiArticles,
      listMediaAssetProfiles,
      insertMediaAssetCredit,
      insertMediaAssetImport,
      findMediaAssetById,
      findMediaAssetImportByUrl,
    }),
  },
) {}
