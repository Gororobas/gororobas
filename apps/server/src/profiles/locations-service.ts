/**
 * The signed-in person's location timeline. Gazetteer places become PLACE articles in the same
 * transaction that saves the entry, so a failed save references nothing.
 */
import {
  ElevationInMeters,
  endsBeforeItStarts,
  Handle,
  IdGen,
  InformationVisibility,
  InvalidProfileLocationDatesError,
  PartialDate,
  ProfileId,
  type ProfileLocationData,
  ProfileLocationId,
  ProfileLocationNotFoundError,
  type ProfileLocationPayload,
  ProfileLocationPlace,
  ProfileLocationPlaceInput,
  ProfileLocationText,
  SupportedLanguage,
  TimestampColumn,
  WhosOnFirstId,
  WikiArticleId,
} from "@gororobas/domain"
import { Context, DateTime, Effect, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

import { Gazetteer } from "../places/gazetteer.js"
import { PlacesService } from "../places/service.js"
import { placeHandle, placeName, profileLocationOrder } from "./location-sql.js"
import { refreshProfileSearchableText } from "./mutations.js"

const ProfileLocationRow = Schema.Struct({
  id: ProfileLocationId,
  profileId: ProfileId,
  kind: Schema.Literals(["FREE_TEXT", "KNOWN_PLACE"]),
  freeText: Schema.NullOr(ProfileLocationText),
  placeId: Schema.NullOr(WikiArticleId),
  label: Schema.NullOr(ProfileLocationText),
  elevation: Schema.NullOr(ElevationInMeters),
  startDate: Schema.NullOr(PartialDate),
  endDate: Schema.NullOr(PartialDate),
  visibility: InformationVisibility,
  createdAt: TimestampColumn,
  updatedAt: TimestampColumn,
})

type ProfileLocationRow = typeof ProfileLocationRow.Type

const ListedProfileLocationRow = Schema.Struct({
  ...ProfileLocationRow.fields,
  whosOnFirstId: Schema.NullOr(WhosOnFirstId),
  placeName: Schema.NullOr(Schema.String),
  placeHandle: Schema.NullOr(Handle),
})

type PlaceColumns = Pick<
  ProfileLocationRow,
  "kind" | "freeText" | "placeId" | "label" | "elevation"
>

const placeColumns = ProfileLocationPlace.match({
  FreeText: (place): PlaceColumns => ({
    kind: "FREE_TEXT" as const,
    freeText: place.text,
    placeId: null,
    label: null,
    elevation: null,
  }),
  KnownPlace: (place): PlaceColumns => ({
    kind: "KNOWN_PLACE" as const,
    freeText: null,
    placeId: place.placeId,
    label: Option.getOrNull(place.label),
    elevation: Option.getOrNull(place.elevation),
  }),
})

const insertProfileLocationRow = SqlSchema.void({
  Request: ProfileLocationRow,
  execute: (row) =>
    SqlClient.SqlClient.use((sql) => sql`INSERT INTO profile_locations ${sql.insert(row)}`),
})

const updateProfileLocationRow = SqlSchema.findOneOption({
  Request: ProfileLocationRow,
  Result: Schema.Struct({ id: ProfileLocationId }),
  execute: ({ id, profileId, createdAt: _createdAt, ...row }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        UPDATE profile_locations SET ${sql.update(row)}
        WHERE id = ${id} AND profile_id = ${profileId}
        RETURNING id
      `,
    ),
})

const deleteProfileLocationRow = SqlSchema.findOneOption({
  Request: Schema.Struct({ id: ProfileLocationId, profileId: ProfileId }),
  Result: Schema.Struct({ id: ProfileLocationId }),
  execute: ({ id, profileId }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        DELETE FROM profile_locations WHERE id = ${id} AND profile_id = ${profileId} RETURNING id
      `,
    ),
})

const findLatestKnownPlace = SqlSchema.findOneOption({
  Request: ProfileId,
  Result: Schema.Struct({ whosOnFirstId: WhosOnFirstId }),
  execute: (profileId) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT place.whos_on_first_id FROM profile_locations location
        JOIN place_projections place ON place.wiki_article_id = location.place_id
        WHERE location.profile_id = ${profileId} AND place.whos_on_first_id IS NOT NULL
        ORDER BY ${profileLocationOrder(sql)}
        LIMIT 1
      `,
    ),
})

const listProfileLocationRows = SqlSchema.findAll({
  Request: Schema.Struct({
    profileId: ProfileId,
    language: SupportedLanguage,
  }),
  Result: ListedProfileLocationRow,
  execute: ({ profileId, language }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT location.*, place.whos_on_first_id,
          ${placeName(sql, { placeIdColumn: "location.place_id", language })} AS place_name,
          ${placeHandle(sql, { placeIdColumn: "location.place_id", language })} AS place_handle
        FROM profile_locations location
        LEFT JOIN place_projections place ON place.wiki_article_id = location.place_id
        WHERE location.profile_id = ${profileId}
        ORDER BY ${profileLocationOrder(sql)}
      `,
    ),
})

/** @effect-expect-leaking SqlClient */
export class ProfileLocationsService extends Context.Service<ProfileLocationsService>()(
  "ProfileLocationsService",
  {
    make: Effect.gen(function* () {
      const gazetteer = yield* Gazetteer
      const places = yield* PlacesService
      const sql = yield* SqlClient.SqlClient

      const list = ({
        profileId,
        language,
      }: Readonly<{ profileId: ProfileId; language: SupportedLanguage }>) =>
        Effect.gen(function* () {
          const rows = yield* listProfileLocationRows({ profileId, language })
          const gazetteerPlaces = yield* gazetteer.findPlaces({
            ids: rows.flatMap((row) => (row.whosOnFirstId === null ? [] : [row.whosOnFirstId])),
            language,
          })

          return rows.flatMap((row): ReadonlyArray<ProfileLocationData> => {
            const common = {
              id: row.id,
              startDate: row.startDate,
              endDate: row.endDate,
              visibility: row.visibility,
              createdAt: row.createdAt,
            }

            if (row.freeText !== null) {
              return [{ ...common, place: { _tag: "FreeText", text: row.freeText } }]
            }
            // A place whose article was never published has no name or handle to show yet.
            if (row.placeId === null || row.placeName === null || row.placeHandle === null) {
              return []
            }

            return [
              {
                ...common,
                place: {
                  _tag: "KnownPlace",
                  placeId: row.placeId,
                  placeName: row.placeName,
                  placeHandle: row.placeHandle,
                  gazetteerPlace:
                    row.whosOnFirstId === null
                      ? null
                      : (gazetteerPlaces[row.whosOnFirstId] ?? null),
                  label: row.label,
                  elevation: row.elevation,
                },
              },
            ]
          })
        })

      const findOwn = ({
        profileId,
        id,
        language,
      }: Readonly<{ profileId: ProfileId; id: ProfileLocationId; language: SupportedLanguage }>) =>
        list({ profileId, language }).pipe(
          Effect.flatMap((locations) => {
            const location = locations.find((candidate) => candidate.id === id)
            return location === undefined
              ? Effect.fail(new ProfileLocationNotFoundError({ id }))
              : Effect.succeed(location)
          }),
        )

      const resolvePlace = (input: ProfileLocationPlaceInput) =>
        ProfileLocationPlaceInput.match(input, {
          FreeText: ({ text }) =>
            Effect.succeed<ProfileLocationPlace>(
              ProfileLocationPlace.cases.FreeText.make({ text }),
            ),
          GazetteerPlace: (gazetteerPlace) =>
            Effect.map(
              places.ensurePlaceArticle(gazetteerPlace.gazetteerPlaceId),
              (placeId): ProfileLocationPlace =>
                ProfileLocationPlace.cases.KnownPlace.make({
                  placeId,
                  label: gazetteerPlace.label,
                  elevation: gazetteerPlace.elevation,
                }),
            ),
        })

      const toRow = (input: {
        id: ProfileLocationId
        profileId: ProfileId
        payload: ProfileLocationPayload
        place: ProfileLocationPlace
        createdAt: DateTime.Utc
        updatedAt: DateTime.Utc
      }): ProfileLocationRow => ({
        id: input.id,
        profileId: input.profileId,
        ...placeColumns(input.place),
        startDate: Option.getOrNull(input.payload.startDate),
        endDate: Option.getOrNull(input.payload.endDate),
        visibility: input.payload.visibility,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      })

      const assertPeriod = (payload: ProfileLocationPayload) =>
        Option.isSome(payload.startDate) &&
        Option.isSome(payload.endDate) &&
        endsBeforeItStarts(payload.startDate.value, payload.endDate.value)
          ? Effect.fail(new InvalidProfileLocationDatesError())
          : Effect.void

      const add = Effect.fn("profileLocations.add")(function* ({
        profileId,
        payload,
        language,
      }: Readonly<{
        profileId: ProfileId
        payload: ProfileLocationPayload
        language: SupportedLanguage
      }>) {
        yield* assertPeriod(payload)
        const id = yield* IdGen.make(ProfileLocationId)
        const now = yield* DateTime.now

        yield* Effect.gen(function* () {
          const place = yield* resolvePlace(payload.place)
          yield* insertProfileLocationRow(
            toRow({ id, profileId, payload, place, createdAt: now, updatedAt: now }),
          )
          yield* refreshProfileSearchableText(profileId)
        }).pipe(sql.withTransaction)

        return yield* findOwn({ profileId, id, language }).pipe(
          // The entry was just saved with a published place: not finding it is a bug.
          Effect.catchTag("ProfileLocationNotFoundError", Effect.die),
        )
      })

      const update = Effect.fn("profileLocations.update")(function* ({
        profileId,
        id,
        payload,
        language,
      }: Readonly<{
        profileId: ProfileId
        id: ProfileLocationId
        payload: ProfileLocationPayload
        language: SupportedLanguage
      }>) {
        yield* assertPeriod(payload)
        const now = yield* DateTime.now

        yield* Effect.gen(function* () {
          const place = yield* resolvePlace(payload.place)
          const updated = yield* updateProfileLocationRow(
            // `createdAt` is never updated.
            toRow({ id, profileId, payload, place, createdAt: now, updatedAt: now }),
          )
          if (Option.isNone(updated)) return yield* new ProfileLocationNotFoundError({ id })
          yield* refreshProfileSearchableText(profileId)
        }).pipe(sql.withTransaction)

        return yield* findOwn({ profileId, id, language }).pipe(
          // The entry was just saved with a published place: not finding it is a bug.
          Effect.catchTag("ProfileLocationNotFoundError", Effect.die),
        )
      })

      const remove = Effect.fn("profileLocations.remove")(
        function* ({ profileId, id }: Readonly<{ profileId: ProfileId; id: ProfileLocationId }>) {
          const deleted = yield* deleteProfileLocationRow({ id, profileId })
          if (Option.isNone(deleted)) return yield* new ProfileLocationNotFoundError({ id })
          yield* refreshProfileSearchableText(profileId)
        },
        (_) => sql.withTransaction(_),
      )

      /** The country of the latest entry with a gazetteer place, to rank place searches. */
      const latestKnownCountry = ({
        profileId,
        language,
      }: Readonly<{ profileId: ProfileId; language: SupportedLanguage }>) =>
        Effect.gen(function* () {
          const latest = yield* findLatestKnownPlace(profileId)
          if (Option.isNone(latest)) return Option.none()
          const summaries = yield* gazetteer.findSummaries({
            ids: [latest.value.whosOnFirstId],
            language,
          })
          return Option.fromNullishOr(summaries[latest.value.whosOnFirstId]?.countryCode)
        })

      return { list, add, update, remove, latestKnownCountry }
    }),
  },
) {}
