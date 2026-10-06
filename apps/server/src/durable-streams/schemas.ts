import { LoroDocFrontier, WikiArticleId } from "@gororobas/domain"
import { Schema, SchemaGetter } from "effect"

export const createEventBinary = <S extends Schema.Top>(schema: S) =>
  Schema.Uint8Array.pipe(
    Schema.decodeTo(Schema.fromJsonString(schema), {
      decode: SchemaGetter.transform((bytes: Uint8Array) => new TextDecoder().decode(bytes)),
      encode: SchemaGetter.transform((json: string) => new TextEncoder().encode(json)),
    }),
  )

export const WikiArticlesCreate = Schema.Struct({
  event: Schema.Literal("wiki_articles.create"),
  wiki_article_id: WikiArticleId,
  loro_snapshot: Schema.Uint8ArrayFromBase64,
  materialized_view: Schema.Struct({ kind: Schema.String, handle: Schema.String }),
})
export const WikiArticlesUpdate = Schema.Struct({
  event: Schema.Literal("wiki_articles.update"),
  wiki_article_id: WikiArticleId,
  crdt_update: Schema.Uint8ArrayFromBase64,
  from_frontier: LoroDocFrontier,
})
export const WikiArticlesDelete = Schema.Struct({
  event: Schema.Literal("wiki_articles.delete"),
  wiki_article_id: WikiArticleId,
})
export const WikiArticleStreamEvent = Schema.Union([
  WikiArticlesCreate,
  WikiArticlesUpdate,
  WikiArticlesDelete,
])
export type WikiArticleStreamEvent = typeof WikiArticleStreamEvent.Type
export const WikiArticleStreamEventBinary = createEventBinary(WikiArticleStreamEvent)

export const PublicationsCreate = Schema.Struct({
  event: Schema.Literal("publications.create"),
  publication_id: Schema.String.pipe(
    Schema.check(Schema.isUUID(undefined)),
    Schema.brand("PublicationId"),
  ),
  loro_snapshot: Schema.Uint8ArrayFromBase64,
  materialized_view: Schema.Struct({
    handle: Schema.String,
    type: Schema.String,
    visibility: Schema.String,
    owner_profile_id: Schema.String,
  }),
})
export const PublicationsUpdate = Schema.Struct({
  event: Schema.Literal("publications.update"),
  publication_id: Schema.String.pipe(
    Schema.check(Schema.isUUID(undefined)),
    Schema.brand("PublicationId"),
  ),
  crdt_update: Schema.Uint8ArrayFromBase64,
  from_frontier: LoroDocFrontier,
})

export const PublicationsDelete = Schema.Struct({
  event: Schema.Literal("publications.delete"),
  publication_id: Schema.String.pipe(
    Schema.check(Schema.isUUID(undefined)),
    Schema.brand("PublicationId"),
  ),
})

export const BookmarksWikiArticlesCreate = Schema.Struct({
  event: Schema.Literal("bookmarks_wiki_articles.create"),
  entity_id: Schema.String,
  person_id: Schema.String,
  vegetable_id: Schema.String,
  state: Schema.String,
})

export const BookmarksWikiArticlesDelete = Schema.Struct({
  event: Schema.Literal("bookmarks_wiki_articles.delete"),
  entity_id: Schema.String,
})

export const ProfileStreamEvent = Schema.Union([
  PublicationsCreate,
  PublicationsUpdate,
  PublicationsDelete,
  BookmarksWikiArticlesCreate,
  BookmarksWikiArticlesDelete,
])
export type ProfileStreamEvent = typeof ProfileStreamEvent.Type
export const ProfileStreamEventBinary = createEventBinary(ProfileStreamEvent)
