import { Schema } from "effect"
/**
 * Posts HTTP API endpoints.
 */
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

import { EventAttendanceMode, InformationVisibility, Locale, PostKind } from "../common/enums.js"
import { PostId, ProfileId } from "../common/ids.js"
import { Handle, PaginationOptions } from "../common/primitives.js"
import { TiptapDocument } from "../rich-text/domain.js"

export const PostSearchParams = Schema.Struct({
  owner_profile_id: Schema.optional(ProfileId),
  type: Schema.optional(PostKind),
  visibility: Schema.optional(InformationVisibility),
  ...PaginationOptions.fields,
})

export const GetPostPageParams = Schema.Struct({
  handle: Handle,
  locale: Locale,
})
export type GetPostPageParams = typeof GetPostPageParams.Type

export const PostCardData = Schema.Struct({
  handle: Handle,
  id: PostId,
  owner_profile_id: ProfileId,
  published_at: Schema.NullishOr(Schema.DateFromString),
  kind: PostKind,
  visibility: InformationVisibility,
})
export type PostCardData = typeof PostCardData.Type

export const NoteData = Schema.Struct({
  content: Schema.parseJson(TiptapDocument),
  created_at: Schema.DateFromString,
  handle: Handle,
  id: PostId,
  locale: Locale,
  owner_profile_id: ProfileId,
  published_at: Schema.NullishOr(Schema.DateFromString),
  kind: Schema.Literal("NOTE" satisfies (typeof PostKind.literals)[0]),
  updated_at: Schema.DateFromString,
  visibility: InformationVisibility,
})
export type NoteData = typeof NoteData.Type

export const EventData = Schema.Struct({
  attendance_mode: Schema.NullishOr(EventAttendanceMode),
  content: Schema.parseJson(TiptapDocument),
  created_at: Schema.DateFromString,
  end_date: Schema.NullishOr(Schema.DateFromString),
  handle: Handle,
  id: PostId,
  locale: Locale,
  location_or_url: Schema.NullishOr(Schema.String),
  owner_profile_id: ProfileId,
  published_at: Schema.NullishOr(Schema.DateFromString),
  start_date: Schema.DateFromString,
  kind: Schema.Literal("EVENT" satisfies (typeof PostKind.literals)[1]),
  updated_at: Schema.DateFromString,
  visibility: InformationVisibility,
})
export type EventData = typeof EventData.Type

export const PostData = Schema.Union(NoteData, EventData)
export type PostData = typeof PostData.Type

export const CreateNoteData = Schema.Struct({
  content: TiptapDocument,
  handle: Handle,
  visibility: InformationVisibility,
})
export type CreateNoteData = typeof CreateNoteData.Type

export const CreateEventData = Schema.Struct({
  attendance_mode: Schema.optional(Schema.NullishOr(EventAttendanceMode)),
  content: TiptapDocument,
  end_date: Schema.optional(Schema.NullishOr(Schema.DateFromString)),
  handle: Handle,
  location_or_url: Schema.optional(Schema.NullishOr(Schema.String)),
  start_date: Schema.DateFromString,
  visibility: InformationVisibility,
})
export type CreateEventData = typeof CreateEventData.Type

export const UpdateNoteData = Schema.Struct({
  content: TiptapDocument,
})
export type UpdateNoteData = typeof UpdateNoteData.Type

export const PostHistoryEntry = Schema.Struct({
  author_id: ProfileId,
  content: TiptapDocument,
  created_at: Schema.DateFromString,
  version: Schema.Int,
})
export type PostHistoryEntry = typeof PostHistoryEntry.Type

export class PostsApiGroup extends HttpApiGroup.make("posts")
  .add(
    HttpApiEndpoint.get("searchPosts", "/posts")
      .addSuccess(Schema.Array(PostCardData))
      .setUrlParams(PostSearchParams),
  )
  .add(
    HttpApiEndpoint.get("getPost", "/posts/:id")
      .addSuccess(PostData)
      .addError(PostNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: PostId })),
  )
  .add(
    HttpApiEndpoint.get("getPostByHandle", "/posts/handle/:handle")
      .addSuccess(PostData)
      .addError(PostNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ handle: Handle })),
  )
  .add(
    HttpApiEndpoint.post("createNote", "/profiles/:profile_id/notes")
      .addSuccess(NoteData)
      .addError(ProfileNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ profileId: ProfileId }))
      .setPayload(CreateNoteData),
  )
  .add(
    HttpApiEndpoint.post("createEvent", "/profiles/:profile_id/events")
      .addSuccess(EventData)
      .addError(ProfileNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ profileId: ProfileId }))
      .setPayload(CreateEventData),
  )
  .add(
    HttpApiEndpoint.patch("updateNote", "/posts/:id")
      .addSuccess(NoteData)
      .addError(PostNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: PostId }))
      .setPayload(UpdateNoteData),
  )
  .add(
    HttpApiEndpoint.del("deletePost", "/posts/:id")
      .addSuccess(Schema.Void)
      .addError(PostNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: PostId })),
  )
  .add(
    HttpApiEndpoint.get("getPostHistory", "/posts/:id/history")
      .addSuccess(Schema.Array(PostHistoryEntry))
      .addError(PostNotFoundError, { status: 404 })
      .setPath(Schema.Struct({ id: PostId })),
  ) {}

import { ProfileNotFoundError } from "../profiles/errors.js"
// Import errors to avoid circular dependencies
import { PostNotFoundError } from "./errors.js"
