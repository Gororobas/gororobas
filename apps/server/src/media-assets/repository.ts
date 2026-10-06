import { Context, Effect } from "effect"

import { censorMediaAsset, insertMediaAsset, insertMediaAssetCredit } from "./mutations.js"
import { findMediaAssetById, findMediaAssetDeliveryById } from "./queries.js"

export class MediaAssetsRepository extends Context.Service<MediaAssetsRepository>()(
  "MediaAssetsRepository",
  {
    make: Effect.succeed({
      insertMediaAsset,
      insertMediaAssetCredit,
      findMediaAssetById,
      findMediaAssetDeliveryById,
      censorMediaAsset,
    }),
  },
) {}
