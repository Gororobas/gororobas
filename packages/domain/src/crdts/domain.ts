import { Schema } from "effect"
import { schema as loroSchema } from "loro-mirror"

import {
  EventAttendanceMode,
  InformationVisibility,
  Locale,
  TranslationSource,
} from "../common/enums.js"
import { PersonId, ProfileId } from "../common/ids.js"
import { Handle } from "../common/primitives.js"

export const LoroDocUpdate = Schema.Uint8Array.pipe(Schema.brand("LoroCrdtUpdateEncoded"))
export type LoroDocUpdate = typeof LoroDocUpdate.Type

export const LoroDocSnapshot = Schema.Uint8Array.pipe(Schema.brand("LoroDocEncoded"))
export type LoroDocSnapshot = typeof LoroDocSnapshot.Type

export const LoroDocFrontier = Schema.Array(
  Schema.Struct({
    peer: Schema.TemplateLiteral([Schema.Number]),
    counter: Schema.Number,
  }),
).pipe(Schema.brand("LoroDocFrontier"))
export type LoroDocFrontier = typeof LoroDocFrontier.Type

export const HumanCommit = Schema.TaggedStruct("HumanCommit", {
  personId: PersonId,
})
export type HumanCommit = typeof HumanCommit.Type

export const SystemCommit = Schema.TaggedStruct("SystemCommit", {
  workflowName: Schema.String,
  workflowVersion: Schema.String,
  model: Schema.String,
})
export type SystemCommit = typeof SystemCommit.Type

export const CrdtCommit = Schema.Union([HumanCommit, SystemCommit])
export type CrdtCommit = typeof CrdtCommit.Type

export const CrdtCommitEncoded = Schema.fromJsonString(CrdtCommit)

export const PostLocalizedDataLoro = loroSchema.LoroMap(
  {
    content: loroSchema.LoroText(),
    original_locale: loroSchema.String<Locale>(),
    translation_source: loroSchema.String<TranslationSource>(),
  },
  { required: true },
)

export const NoteMetadataLoro = loroSchema.LoroMap({
  handle: loroSchema.String<Handle>({ required: true }),
  kind: loroSchema.String<"NOTE">(),
  owner_profile_id: loroSchema.String<ProfileId>({ required: true }),
  published_at: loroSchema.String(),
  visibility: loroSchema.String<InformationVisibility>({ required: true }),
})

export const EventMetadataLoro = loroSchema.LoroMap({
  attendance_mode: loroSchema.String<EventAttendanceMode>(),
  end_date: loroSchema.String(),
  handle: loroSchema.String<Handle>({ required: true }),
  kind: loroSchema.String<"EVENT">(),
  location_or_url: loroSchema.String(),
  owner_profile_id: loroSchema.String<ProfileId>({ required: true }),
  published_at: loroSchema.String(),
  start_date: loroSchema.String({ required: true }),
  visibility: loroSchema.String<InformationVisibility>({ required: true }),
})

export const NoteSourceDataLoro = loroSchema({
  locales: loroSchema.LoroMap(
    {
      en: PostLocalizedDataLoro,
      es: PostLocalizedDataLoro,
      pt: PostLocalizedDataLoro,
    },
    { required: true },
  ),
  metadata: NoteMetadataLoro,
})

export const EventSourceDataLoro = loroSchema({
  locales: loroSchema.LoroMap(
    {
      en: PostLocalizedDataLoro,
      es: PostLocalizedDataLoro,
      pt: PostLocalizedDataLoro,
    },
    { required: true },
  ),
  metadata: EventMetadataLoro,
})
