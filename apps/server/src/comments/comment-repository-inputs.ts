import {
  CommentId,
  LoroDocFrontier,
  LoroDocUpdate,
  Locale,
  PersonId,
  PublicationId,
  ProfileId,
  SourceCommentData,
  SystemCommit,
  TiptapDocument,
} from "@gororobas/domain"
import { Schema } from "effect"

export const HumanCrdtUpdate = Schema.TaggedStruct("HumanCrdtUpdate", {
  authorId: PersonId,
  commentId: CommentId,
  crdtUpdate: LoroDocUpdate,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
})

export type HumanCrdtUpdate = typeof HumanCrdtUpdate.Type

export const SystemUpsertTranslation = Schema.TaggedStruct("SystemUpsertTranslation", {
  commentId: CommentId,
  commit: SystemCommit,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
  sourceLocale: Locale,
  targetLocale: Locale,
  translatedContent: TiptapDocument,
})

export type SystemUpsertTranslation = typeof SystemUpsertTranslation.Type

export const UpdateCommentInput = Schema.Union([HumanCrdtUpdate, SystemUpsertTranslation])
export type UpdateCommentInput = typeof UpdateCommentInput.Type

export const CreateCommentInput = Schema.Struct({
  createdById: PersonId,
  ownerProfileId: ProfileId,
  parentCommentId: Schema.NullOr(CommentId),
  publicationId: PublicationId,
  sourceData: SourceCommentData,
})

export type CreateCommentInput = typeof CreateCommentInput.Type
