import { languageFallbackOrder, type SupportedLanguage } from "@gororobas/domain"
import type { SqlClient } from "effect/sql"

/**
 * Ranks `languageColumn` by `languageFallbackOrder(language)`, lowest first, for `ORDER BY`ing
 * translations so the best match comes first.
 *
 * `languageColumn` is inlined, so it must be a column reference written in code, never input.
 */
export const orderByLanguagePreference = (
  sql: SqlClient.SqlClient,
  { languageColumn, language }: { languageColumn: string; language: SupportedLanguage },
) => {
  const order = languageFallbackOrder(language)
  const rankings = order.map(
    (candidate, rank) => sql`WHEN ${candidate} THEN ${sql.literal(String(rank))}`,
  )
  return sql`CASE ${sql.literal(languageColumn)} ${sql.join(" ", false)(rankings)} ELSE ${sql.literal(String(order.length))} END`
}
