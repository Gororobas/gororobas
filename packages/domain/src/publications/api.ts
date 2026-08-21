import { Schema } from "effect"
/**
 * Publications HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

import { PublicationId, ProfileId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import {
  ApiCreateEventData,
  ApiCreatePostData,
  ApiEventData,
  ApiGetPublicationPageParams,
  ApiPostData,
  ApiPublicationCardData,
  ApiPublicationData,
  ApiPublicationHistoryEntry,
  ApiPublicationSearchParams,
  ApiUpdatePostData,
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
      error: PublicationNotFoundError,
      params: Schema.Struct({ id: PublicationId }),
    }),
  )
  .add(
    HttpApiEndpoint.get("getPublicationByHandle", "/publications/handle/:handle", {
      success: ApiPublicationData,
      error: PublicationNotFoundError,
      params: Schema.Struct({ handle: Handle }),
    }),
  )
  .add(
    HttpApiEndpoint.post("createPost", "/profiles/:profileId/posts", {
      success: ApiPostData,
      error: ProfileNotFoundError,
      params: Schema.Struct({ profileId: ProfileId }),
      payload: ApiCreatePostData,
    }),
  )
  .add(
    HttpApiEndpoint.post("createEvent", "/profiles/:profileId/events", {
      success: ApiEventData,
      error: ProfileNotFoundError,
      params: Schema.Struct({ profileId: ProfileId }),
      payload: ApiCreateEventData,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updatePost", "/publications/:id", {
      success: ApiPostData,
      error: Schema.Union([PublicationNotFoundError, PublicationConcurrentUpdateError]),
      params: Schema.Struct({ id: PublicationId }),
      payload: ApiUpdatePostData,
    }),
  )
  .add(
    HttpApiEndpoint.delete("deletePublication", "/publications/:id", {
      success: Schema.Void,
      error: PublicationNotFoundError,
      params: Schema.Struct({ id: PublicationId }),
    }),
  )
  .add(
    HttpApiEndpoint.get("getPublicationHistory", "/publications/:id/history", {
      success: Schema.Array(ApiPublicationHistoryEntry),
      error: PublicationNotFoundError,
      params: Schema.Struct({ id: PublicationId }),
    }),
  ) {}

import { ProfileNotFoundError } from "../profiles/errors.js"
// Import errors to avoid circular dependencies
import { PublicationConcurrentUpdateError, PublicationNotFoundError } from "./errors.js"
