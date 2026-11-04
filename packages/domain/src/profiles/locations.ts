/**
 * A profile's location timeline: where its owner grows, has lived or is passing through, each
 * entry shared only as widely as they choose.
 *
 * Entries never hold coordinates. A known place is a PLACE wiki article for a municipality, state
 * or country, and the only detail finer than that is the elevation a device reported.
 */
import { Array as EffectArray, Option, Schema, SchemaGetter } from "effect"

import { InformationVisibility } from "../common/enums.js"
import { WhosOnFirstId } from "../common/external-identifiers.js"
import { ProfileId, ProfileLocationId, WikiArticleId } from "../common/ids.js"
import {
  Handle,
  NonEmptyTrimmedString,
  OptionalColumn,
  TimestampColumn,
} from "../common/primitives.js"
import { PartialDate } from "../common/utils/dates.js"
import { GazetteerPlace } from "../places/domain.js"

/**
 * Meters above sea level, rounded to 10: as precise as the device allows, without pretending to
 * more. Readers other than its owner never see it.
 */
export const ElevationInMeters = Schema.Finite.check(
  Schema.isBetween({ minimum: -500, maximum: 9000 }),
).pipe(
  Schema.decodeTo(Schema.Int.check(Schema.isMultipleOf(10)), {
    decode: SchemaGetter.transform((meters: number) => Math.round(meters / 10) * 10),
    encode: SchemaGetter.transform((meters: number) => meters),
  }),
)

export type ElevationInMeters = typeof ElevationInMeters.Type

export const ProfileLocationText = NonEmptyTrimmedString.check(Schema.isMaxLength(120))

export const ProfileLocationPlace = Schema.TaggedUnion({
  /** A phrase instead of a place: "Online", "Viajando por aí", "Algún rincón de Argentina". */
  FreeText: { text: ProfileLocationText },
  KnownPlace: {
    placeId: WikiArticleId,
    /** The owner's own words for where they are: "entre Villa de Leyva y Sáchica". */
    label: OptionalColumn(ProfileLocationText),
    elevation: OptionalColumn(ElevationInMeters),
  },
})

export type ProfileLocationPlace = typeof ProfileLocationPlace.Type

export const ProfileLocation = Schema.Struct({
  id: ProfileLocationId,
  profileId: ProfileId,
  place: ProfileLocationPlace,
  startDate: OptionalColumn(PartialDate),
  endDate: OptionalColumn(PartialDate),
  visibility: InformationVisibility,
  createdAt: TimestampColumn,
  updatedAt: TimestampColumn,
})

export type ProfileLocation = typeof ProfileLocation.Type

/** What people send: gazetteer places become PLACE articles when the entry is saved. */
export const ProfileLocationPlaceInput = Schema.TaggedUnion({
  FreeText: { text: ProfileLocationText },
  GazetteerPlace: {
    gazetteerPlaceId: WhosOnFirstId,
    label: OptionalColumn(ProfileLocationText),
    elevation: OptionalColumn(ElevationInMeters),
  },
})

export type ProfileLocationPlaceInput = typeof ProfileLocationPlaceInput.Type

const datePrefix = (date: PartialDate): ReadonlyArray<number> => [
  date.year,
  ...("month" in date ? [date.month] : []),
  ...("day" in date ? [date.day] : []),
]

/**
 * Whether `end` comes before `start`, compared at the coarser of their precisions: an entry from
 * March 2023 to 2023 is fine.
 */
export const endsBeforeItStarts = (start: PartialDate, end: PartialDate): boolean =>
  Option.exists(
    EffectArray.findFirst(
      EffectArray.zip(datePrefix(start), datePrefix(end)),
      ([startPart, endPart]) => startPart !== endPart,
    ),
    ([startPart, endPart]) => endPart < startPart,
  )

export const ProfileLocationPayload = Schema.Struct({
  place: ProfileLocationPlaceInput,
  startDate: OptionalColumn(PartialDate),
  endDate: OptionalColumn(PartialDate),
  visibility: InformationVisibility,
})

export type ProfileLocationPayload = typeof ProfileLocationPayload.Type

/** An entry as its owner sees it, with the place it refers to. */
export const ProfileLocationData = Schema.Struct({
  id: ProfileLocationId,
  place: Schema.TaggedUnion({
    FreeText: { text: ProfileLocationText },
    KnownPlace: {
      placeId: WikiArticleId,
      placeName: Schema.String,
      placeHandle: Handle,
      /** With its outline. Null for places that aren't in the gazetteer. */
      gazetteerPlace: Schema.NullOr(GazetteerPlace),
      label: Schema.NullOr(ProfileLocationText),
      elevation: Schema.NullOr(ElevationInMeters),
    },
  }),
  startDate: Schema.NullOr(PartialDate),
  endDate: Schema.NullOr(PartialDate),
  visibility: InformationVisibility,
  createdAt: TimestampColumn,
})

export type ProfileLocationData = typeof ProfileLocationData.Type

/**
 * The latest location on a profile's card, when it's public: its owner's words, or the place's
 * name. A private or community latest entry shows nothing rather than an older public one, which
 * would suggest they're still there.
 */
export const ProfileLocationCardData = Schema.Struct({
  text: Schema.String,
  placeHandle: Schema.NullOr(Handle),
})
export type ProfileLocationCardData = typeof ProfileLocationCardData.Type
