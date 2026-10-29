import { Context, Effect } from "effect"

import {
  updateMediaAssetDescriptions,
  insertMediaAsset,
  insertMediaAssetCredit,
} from "./mutations.js"
import {
  findMediaAssetById,
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
      findMediaAssetById,
    }),
  },
) {}
