import { Schema } from "effect"
/**
 * Publications HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { UnauthorizedError } from "../authorization/session.js"
import { PublicationId, ProfileId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import { InvalidCrdtUpdateError } from "../crdts/errors.js"
import { InvalidMediaAssetError, MediaNotFoundError } from "../media-assets/errors.js"
import {
  ApiCreatePublicationData,
  ApiGetPublicationPageParams,
  ApiPublicationCardData,
  ApiPublicationData,
  ApiPublicationHistoryEntry,
  ApiPublicationSearchParams,
  ApiUpdatePublicationData,
} from "./domain.js"

export const GetPublicationPageParams = ApiGetPublicationPageParams
export type GetPublicationPageParams = typeof GetPublicationPageParams.Type

export class PublicationsApiGroup extends HttpApiGroup.make("publications")
  .add(
    HttpApiEndpoint.get("searchPublications", "/publications", {
      success: Schema.Array(ApiPublicationCardData),
      query: ApiPublicationSearchParams,
    }),
  )
  .add(
    HttpApiEndpoint.get("getPublication", "/publications/:id", {
      success: ApiPublicationData,
      error: [PublicationNotFoundError, UnauthorizedError],
      params: Schema.Struct({ id: PublicationId }),
    }),
  )
  .add(
    HttpApiEndpoint.get("getPublicationByHandle", "/publications/handle/:handle", {
      success: ApiPublicationData,
      error: [PublicationNotFoundError, UnauthorizedError],
      params: Schema.Struct({ handle: Handle }),
    }),
  )
  .add(
    HttpApiEndpoint.post("createPublication", "/profiles/:profileId/publications", {
      success: ApiPublicationData,
      error: [
        ProfileNotFoundError,
        PublicationNotFoundError,
        InvalidCrdtUpdateError,
        UnauthorizedError,
        InvalidMediaAssetError,
        MediaNotFoundError,
      ],
      params: Schema.Struct({ profileId: ProfileId }),
      payload: ApiCreatePublicationData,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updatePublication", "/publications/:id", {
      success: ApiPublicationData,
      error: Schema.Union([
        PublicationNotFoundError,
        UnauthorizedError,
        InvalidMediaAssetError,
        MediaNotFoundError,
        PublicationConcurrentUpdateError,
        InvalidCrdtUpdateError,
      ]),
      params: Schema.Struct({ id: PublicationId }),
      payload: ApiUpdatePublicationData,
    }),
  )
  .add(
    HttpApiEndpoint.delete("deletePublication", "/publications/:id", {
      success: Schema.Void,
      error: [PublicationNotFoundError, UnauthorizedError],
      params: Schema.Struct({ id: PublicationId }),
    }),
  )
  .add(
    HttpApiEndpoint.get("getPublicationHistory", "/publications/:id/history", {
      success: Schema.Array(ApiPublicationHistoryEntry),
      error: [PublicationNotFoundError, UnauthorizedError],
      params: Schema.Struct({ id: PublicationId }),
    }),
  ) {}

import { ProfileNotFoundError } from "../profiles/errors.js"
// Import errors to avoid circular dependencies
import { PublicationConcurrentUpdateError, PublicationNotFoundError } from "./errors.js"
