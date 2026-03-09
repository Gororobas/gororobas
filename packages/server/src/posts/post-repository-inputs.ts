import {
  Locale,
  PersonId,
  SourcePostData,
  SystemCommit,
  TiptapDocument,
  PostId,
} from "@gororobas/domain"
import { Schema } from "effect"

export const HumanUpdatePtContent = Schema.TaggedStruct("HumanUpdatePtContent", {
  authorId: PersonId,
  postId: PostId,
  content: TiptapDocument,
})
export type HumanUpdatePtContent = typeof HumanUpdatePtContent.Type

export const SystemUpsertTranslation = Schema.TaggedStruct("SystemUpsertTranslation", {
  postId: PostId,
  sourceLocale: Locale,
  targetLocale: Locale,
  translatedContent: TiptapDocument,
  commit: SystemCommit,
})
export type SystemUpsertTranslation = typeof SystemUpsertTranslation.Type

export const UpdatePostInput = Schema.Union([HumanUpdatePtContent, SystemUpsertTranslation])
export type UpdatePostInput = typeof UpdatePostInput.Type

export const CreatePostInput = Schema.Struct({
  createdById: PersonId,
  sourceData: SourcePostData,
})
export type CreatePostInput = typeof CreatePostInput.Type
