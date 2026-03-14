import {
  CommentId,
  LoroDocFrontier,
  Locale,
  PersonId,
  PostId,
  ProfileId,
  ResourceId,
  SourceCommentData,
  SystemCommit,
  TiptapDocument,
} from "@gororobas/domain"
import { Schema } from "effect"

export const HumanUpdatePtContent = Schema.TaggedStruct("HumanUpdatePtContent", {
  authorId: PersonId,
  commentId: CommentId,
  content: TiptapDocument,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
})
export type HumanUpdatePtContent = typeof HumanUpdatePtContent.Type

export const SystemUpsertTranslation = Schema.TaggedStruct("SystemUpsertTranslation", {
  commentId: CommentId,
  commit: SystemCommit,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
  sourceLocale: Locale,
  targetLocale: Locale,
  translatedContent: TiptapDocument,
})
export type SystemUpsertTranslation = typeof SystemUpsertTranslation.Type

export const UpdateCommentInput = Schema.Union([HumanUpdatePtContent, SystemUpsertTranslation])
export type UpdateCommentInput = typeof UpdateCommentInput.Type

export const CreateCommentInput = Schema.Struct({
  createdById: PersonId,
  ownerProfileId: ProfileId,
  parentCommentId: Schema.NullOr(CommentId),
  postId: Schema.NullOr(PostId),
  resourceId: Schema.NullOr(ResourceId),
  sourceData: SourceCommentData,
})
export type CreateCommentInput = typeof CreateCommentInput.Type
