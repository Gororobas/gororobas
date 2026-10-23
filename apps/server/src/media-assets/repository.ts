import { Context, Effect } from "effect"

import {
  updateMediaAssetDescriptions,
  insertMediaAsset,
  insertMediaAssetCredit,
} from "./mutations.js"
import {
  findMediaAssetById,
  listMediaAssetPublications,
  listMediaAssetWikiArticles,
  listMediaAssetProfiles,
} from "./queries.js"

export class MediaAssetsRepository extends Context.Service<MediaAssetsRepository>()(
  "MediaAssetsRepository",
  {
    make: Effect.succeed({
      insertMediaAsset,
      updateMediaAssetDescriptions,
      listMediaAssetPublications,
      listMediaAssetWikiArticles,
      listMediaAssetProfiles,
      insertMediaAssetCredit,
      findMediaAssetById,
    }),
  },
) {}
