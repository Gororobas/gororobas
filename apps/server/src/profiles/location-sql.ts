import { type SupportedLanguage } from "@gororobas/domain"
import type { SqlClient } from "effect/sql/SqlClient"

import { orderByLanguagePreference } from "../db/language-preference.js"

/**
 * Timeline order, under the `location` alias: entries without an end first (where the profile is
 * now), then the latest started, then the latest added. The first entry is its latest location.
 * Encoded partial dates sort like their dates within a precision; a bare year sorts first.
 */
export const profileLocationOrder = (sql: SqlClient) =>
  sql`location.end_date IS NOT NULL, location.start_date IS NULL, location.start_date DESC, location.created_at DESC, location.id DESC`

/** A PLACE article's name in the translation that best matches `language`. */
export const placeName = (
  sql: SqlClient,
  { placeIdColumn, language }: { placeIdColumn: string; language: SupportedLanguage },
) => sql`(SELECT json_extract(translation.common_names, '$[0].name')
  FROM wiki_article_translations translation
  WHERE translation.wiki_article_id = ${sql.literal(placeIdColumn)}
  ORDER BY ${orderByLanguagePreference(sql, { languageColumn: "translation.language", language })}
  LIMIT 1)`

export const placeHandle = (
  sql: SqlClient,
  { placeIdColumn, language }: { placeIdColumn: string; language: SupportedLanguage },
) => sql`(SELECT handle.handle FROM wiki_article_handles handle
  WHERE handle.wiki_article_id = ${sql.literal(placeIdColumn)}
  ORDER BY ${orderByLanguagePreference(sql, { languageColumn: "handle.language", language })}, handle.handle
  LIMIT 1)`

/**
 * `ProfileLocationCardData` as JSON for the profile in `profileIdColumn`, or NULL: its latest
 * entry, only when that entry is public.
 *
 * `profileIdColumn` is inlined, so it must be a column reference written in code, never input.
 */
export const latestPublicProfileLocationJson = (
  sql: SqlClient,
  { profileIdColumn, language }: { profileIdColumn: string; language: SupportedLanguage },
) => sql`(SELECT json_object(
    'text', COALESCE(latest.free_text, latest.label, ${placeName(sql, { placeIdColumn: "latest.place_id", language })}),
    'placeHandle', ${placeHandle(sql, { placeIdColumn: "latest.place_id", language })})
  FROM (
    SELECT location.* FROM profile_locations location
    WHERE location.profile_id = ${sql.literal(profileIdColumn)}
    ORDER BY ${profileLocationOrder(sql)}
    LIMIT 1
  ) latest
  WHERE latest.visibility = 'PUBLIC')`
