import { LoroDocFrontier, VegetableId } from "@gororobas/domain"
import { Schema, SchemaGetter } from "effect"

export const createEventBinary = <S extends Schema.Top>(schema: S) =>
  Schema.Uint8Array.pipe(
    Schema.decodeTo(schema, {
      decode: SchemaGetter.transform((bytes: Uint8Array) =>
        JSON.parse(new TextDecoder().decode(bytes)),
      ),
      encode: SchemaGetter.transform((data: S["Type"]) =>
        new TextEncoder().encode(JSON.stringify(data)),
      ),
    }),
  )

export const VegetablesCreate = Schema.Struct({
  event: Schema.Literal("vegetables.create"),
  vegetable_id: VegetableId,
  loro_snapshot: Schema.Uint8ArrayFromBase64,
  materialized_view: Schema.Struct({
    handle: Schema.String,
    scientific_names: Schema.optional(Schema.Array(Schema.String)),
  }),
})

export const VegetablesUpdate = Schema.Struct({
  event: Schema.Literal("vegetables.update"),
  vegetable_id: VegetableId,
  crdt_update: Schema.Uint8ArrayFromBase64,
  from_frontier: LoroDocFrontier,
})

export const VegetablesDelete = Schema.Struct({
  event: Schema.Literal("vegetables.delete"),
  vegetable_id: VegetableId,
})

export const VegetableStreamEvent = Schema.Union([
  VegetablesCreate,
  VegetablesUpdate,
  VegetablesDelete,
])
export type VegetableStreamEvent = typeof VegetableStreamEvent.Type

export const VegetableStreamEventBinary = createEventBinary(VegetableStreamEvent)

export const PostsCreate = Schema.Struct({
  event: Schema.Literal("posts.create"),
  post_id: Schema.String.pipe(Schema.check(Schema.isUUID(undefined)), Schema.brand("PostId")),
  loro_snapshot: Schema.Uint8ArrayFromBase64,
  materialized_view: Schema.Struct({
    handle: Schema.String,
    type: Schema.String,
    visibility: Schema.String,
    owner_profile_id: Schema.String,
  }),
})

export const PostsUpdate = Schema.Struct({
  event: Schema.Literal("posts.update"),
  post_id: Schema.String.pipe(Schema.check(Schema.isUUID(undefined)), Schema.brand("PostId")),
  crdt_update: Schema.Uint8ArrayFromBase64,
  from_frontier: LoroDocFrontier,
})

export const PostsDelete = Schema.Struct({
  event: Schema.Literal("posts.delete"),
  post_id: Schema.String.pipe(Schema.check(Schema.isUUID(undefined)), Schema.brand("PostId")),
})

export const BookmarksVegetablesCreate = Schema.Struct({
  event: Schema.Literal("bookmarks_vegetables.create"),
  entity_id: Schema.String,
  person_id: Schema.String,
  vegetable_id: Schema.String,
  state: Schema.String,
})

export const BookmarksVegetablesDelete = Schema.Struct({
  event: Schema.Literal("bookmarks_vegetables.delete"),
  entity_id: Schema.String,
})

export const BookmarksResourcesCreate = Schema.Struct({
  event: Schema.Literal("bookmarks_resources.create"),
  entity_id: Schema.String,
  person_id: Schema.String,
  resource_id: Schema.String,
  state: Schema.String,
})

export const BookmarksResourcesDelete = Schema.Struct({
  event: Schema.Literal("bookmarks_resources.delete"),
  entity_id: Schema.String,
})

export const ProfileStreamEvent = Schema.Union([
  PostsCreate,
  PostsUpdate,
  PostsDelete,
  BookmarksVegetablesCreate,
  BookmarksVegetablesDelete,
  BookmarksResourcesCreate,
  BookmarksResourcesDelete,
])
export type ProfileStreamEvent = typeof ProfileStreamEvent.Type

export const ProfileStreamEventBinary = createEventBinary(ProfileStreamEvent)
