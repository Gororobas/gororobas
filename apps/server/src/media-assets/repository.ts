import { Context, Effect } from "effect"

import {
  updateMediaAssetDescriptions,
  moderateMediaAsset,
  insertMediaAsset,
  insertMediaAssetCredit,
} from "./mutations.js"
import {
  findMediaAssetById,
  listMediaAssetPublications,
  listMediaAssetWikiArticles,
} from "./queries.js"

export class MediaAssetsRepository extends Context.Service<MediaAssetsRepository>()(
  "MediaAssetsRepository",
  {
    make: Effect.succeed({
      insertMediaAsset,
      updateMediaAssetDescriptions,
      listMediaAssetPublications,
      listMediaAssetWikiArticles,
      insertMediaAssetCredit,
      findMediaAssetById,
      moderateMediaAsset,
    }),
  },
) {}
