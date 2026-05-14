import {
  Locale,
  LoroDocFrontier,
  LoroDocUpdate,
  PersonId,
  PostSourceData,
  SystemCommit,
  TiptapDocument,
  PostId,
} from "@gororobas/domain"
import { Schema } from "effect"

export const HumanCrdtUpdate = Schema.TaggedStruct("HumanCrdtUpdate", {
  authorId: PersonId,
  crdtUpdate: LoroDocUpdate,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
  postId: PostId,
})
export type HumanCrdtUpdate = typeof HumanCrdtUpdate.Type

export const SystemUpsertTranslation = Schema.TaggedStruct("SystemUpsertTranslation", {
  expectedCurrentCrdtFrontier: LoroDocFrontier,
  postId: PostId,
  sourceLocale: Locale,
  targetLocale: Locale,
  translatedContent: TiptapDocument,
  commit: SystemCommit,
})
export type SystemUpsertTranslation = typeof SystemUpsertTranslation.Type

export const UpdatePostInput = Schema.Union([HumanCrdtUpdate, SystemUpsertTranslation])
export type UpdatePostInput = typeof UpdatePostInput.Type

export const CreatePostInput = Schema.Struct({
  createdById: PersonId,
  sourceData: PostSourceData,
})
export type CreatePostInput = typeof CreatePostInput.Type
