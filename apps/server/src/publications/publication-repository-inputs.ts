import {
  ContentLanguage,
  CorePublicationMetadata,
  SupportedLanguage,
  LoroDocFrontier,
  LoroDocUpdate,
  PersonId,
  PublicationSourceData,
  SystemCommit,
  TiptapDocument,
  PublicationId,
} from "@gororobas/domain"
import { Schema } from "effect"

export const HumanCrdtUpdate = Schema.TaggedStruct("HumanCrdtUpdate", {
  authorId: PersonId,
  crdtUpdate: LoroDocUpdate,
  expectedCurrentCrdtFrontier: LoroDocFrontier,
  publicationId: PublicationId,
})

export type HumanCrdtUpdate = typeof HumanCrdtUpdate.Type

/** Has no expected frontier: it's discarded as stale only if the source content at `sourceCrdtFrontier` changed. */
export const SystemUpsertTranslation = Schema.TaggedStruct("SystemUpsertTranslation", {
  publicationId: PublicationId,
  sourceLanguage: ContentLanguage,
  sourceCrdtFrontier: LoroDocFrontier,
  targetLanguage: SupportedLanguage,
  translatedContent: TiptapDocument,
  commit: SystemCommit,
})

export type SystemUpsertTranslation = typeof SystemUpsertTranslation.Type

export const UpdatePublicationInput = Schema.Union([HumanCrdtUpdate, SystemUpsertTranslation])
export type UpdatePublicationInput = typeof UpdatePublicationInput.Type

export const CreatePublicationInput = Schema.Struct({
  ...CorePublicationMetadata.fields,
  createdById: PersonId,
  sourceData: PublicationSourceData,
})

export type CreatePublicationInput = typeof CreatePublicationInput.Type
