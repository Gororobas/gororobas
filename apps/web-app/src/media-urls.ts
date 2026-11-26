import { GororobasApi } from "@gororobas/domain/apis"
import type { MediaAssetId } from "@gororobas/domain/common/ids"
import type { TransformedImageWidthBreakpoints } from "@gororobas/domain/media-assets/domain"
import type { WikiArticleQueriedCardData } from "@gororobas/domain/wiki/domain"
import { Option } from "effect"
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

/** An article's main photo, or a provider's while it has none, sized for thumbnails. */
export const articleThumbnailUrl = (article: WikiArticleQueriedCardData): Option.Option<string> =>
  Option.map(article.thumbnailMediaAssetId, (id) => imageUrl(id, 300))
