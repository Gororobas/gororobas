import { GororobasApi } from "@gororobas/domain/apis"
import type { MediaAssetId } from "@gororobas/domain/common/ids"
import type { TransformedImageWidthBreakpoints } from "@gororobas/domain/media-assets/domain"
import { HttpApiClient } from "effect/http-api"

import { API_BASE_PATH } from "./api-client"

// `urlBuilder` resolves `baseUrl` with `new URL`, which rejects relative paths, so we prefix it ourselves.
const buildUrl = HttpApiClient.urlBuilder(GororobasApi)

export const imageUrl = (
  id: MediaAssetId,
  width: typeof TransformedImageWidthBreakpoints.Type,
): string =>
  `${API_BASE_PATH}${buildUrl.mediaAssets.getMedia({
    params: { id, format: "images", variant: `${width}` },
  })}`

export const audioUrl = (id: MediaAssetId): string =>
  `${API_BASE_PATH}${buildUrl.mediaAssets.getMedia({
    params: { id, format: "audio", variant: "audio.m4a" },
  })}`

const INATURALIST_ORIGINAL =
  /^(https:\/\/inaturalist-open-data\.s3\.amazonaws\.com\/photos\/\d+\/)original(\.\w+)$/

/**
 * A provider's photo at about `width`. Most come from iNaturalist, which also serves each photo as
 * `medium` (500px) and `large` (1024px); other providers' URLs are used as they are.
 */
export const externalImageUrl = (url: string, width: 300 | 1280): string =>
  url.replace(INATURALIST_ORIGINAL, `$1${width <= 300 ? "medium" : "large"}$2`)
