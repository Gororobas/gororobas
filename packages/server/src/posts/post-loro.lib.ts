import type {
  Handle,
  InformationVisibility,
  TranslationSource,
  Locale,
  EventAttendanceMode,
  PostKind,
} from "@gororobas/domain"
import { schema as loroSchema } from "loro-mirror"

export const PostLocalizedDataLoro = loroSchema.LoroMap(
  {
    content: loroSchema.String({ required: true }),
    original_locale: loroSchema.String<Locale>({ required: true }),
    translation_source: loroSchema.String<TranslationSource>({ required: true }),
  },
  { required: false },
)

export const CoreMetadataLoro = {
  handle: loroSchema.String<Handle>({ required: true }),
  owner_profile_id: loroSchema.String({ required: true }),
  published_at: loroSchema.String({ required: false }),
  visibility: loroSchema.String<InformationVisibility>({ required: true }),
}

export const NoteMetadataLoro = loroSchema.LoroMap({
  ...CoreMetadataLoro,
  kind: loroSchema.String({ required: true }),
})

export const EventMetadataLoro = loroSchema.LoroMap({
  ...CoreMetadataLoro,
  kind: loroSchema.String({ required: true }),
  start_date: loroSchema.String({ required: true }),
  end_date: loroSchema.String({ required: false }),
  location_or_url: loroSchema.String({ required: false }),
  attendance_mode: loroSchema.String<EventAttendanceMode>({ required: false }),
})

const LocalesLoro = loroSchema.LoroMap(
  {
    en: PostLocalizedDataLoro,
    es: PostLocalizedDataLoro,
    pt: PostLocalizedDataLoro,
  },
  { required: true },
)

export const NoteSourceDataLoro = loroSchema({
  locales: LocalesLoro,
  metadata: NoteMetadataLoro,
})

export const EventSourceDataLoro = loroSchema({
  locales: LocalesLoro,
  metadata: EventMetadataLoro,
})

export const PostMetadataLoro = loroSchema.LoroMap({
  ...CoreMetadataLoro,
  kind: loroSchema.String<PostKind>({ required: true }),
  start_date: loroSchema.String({ required: false }),
  end_date: loroSchema.String({ required: false }),
  location_or_url: loroSchema.String({ required: false }),
  attendance_mode: loroSchema.String<EventAttendanceMode>({ required: false }),
})

export const PostSourceDataLoro = loroSchema({
  locales: LocalesLoro,
  metadata: PostMetadataLoro,
})
