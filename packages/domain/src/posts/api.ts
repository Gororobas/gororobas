import { Schema } from "effect"
/**
 * Posts HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

import { PostId, ProfileId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"
import {
  ApiCreateEventData,
  ApiCreateNoteData,
  ApiEventData,
  ApiGetPostPageParams,
  ApiNoteData,
  ApiPostCardData,
  ApiPostData,
  ApiPostHistoryEntry,
  ApiPostSearchParams,
  ApiUpdateNoteData,
} from "./domain.js"

export const GetPostPageParams = ApiGetPostPageParams
export type GetPostPageParams = typeof GetPostPageParams.Type

export class PostsApiGroup extends HttpApiGroup.make("posts")
  .add(
    HttpApiEndpoint.get("searchPosts", "/posts", {
      success: Schema.Array(ApiPostCardData),
      query: ApiPostSearchParams,
    }),
  )
  .add(
    HttpApiEndpoint.get("getPost", "/posts/:id", {
      success: ApiPostData,
      error: PostNotFoundError,
      params: Schema.Struct({ id: PostId }),
    }),
  )
  .add(
    HttpApiEndpoint.get("getPostByHandle", "/posts/handle/:handle", {
      success: ApiPostData,
      error: PostNotFoundError,
      params: Schema.Struct({ handle: Handle }),
    }),
  )
  .add(
    HttpApiEndpoint.post("createNote", "/profiles/:profile_id/notes", {
      success: ApiNoteData,
      error: ProfileNotFoundError,
      params: Schema.Struct({ profileId: ProfileId }),
      payload: ApiCreateNoteData,
    }),
  )
  .add(
    HttpApiEndpoint.post("createEvent", "/profiles/:profile_id/events", {
      success: ApiEventData,
      error: ProfileNotFoundError,
      params: Schema.Struct({ profileId: ProfileId }),
      payload: ApiCreateEventData,
    }),
  )
  .add(
    HttpApiEndpoint.patch("updateNote", "/posts/:id", {
      success: ApiNoteData,
      error: PostNotFoundError,
      params: Schema.Struct({ id: PostId }),
      payload: ApiUpdateNoteData,
    }),
  )
  .add(
    HttpApiEndpoint.delete("deletePost", "/posts/:id", {
      success: Schema.Void,
      error: PostNotFoundError,
      params: Schema.Struct({ id: PostId }),
    }),
  )
  .add(
    HttpApiEndpoint.get("getPostHistory", "/posts/:id/history", {
      success: Schema.Array(ApiPostHistoryEntry),
      error: PostNotFoundError,
      params: Schema.Struct({ id: PostId }),
    }),
  ) {}

import { ProfileNotFoundError } from "../profiles/errors.js"
// Import errors to avoid circular dependencies
import { PostNotFoundError } from "./errors.js"
