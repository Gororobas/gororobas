import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import { msg } from "@lingui/core/macro"
import { DateTime } from "effect"

import { intlTags } from "./language"
import { translatorFor } from "./translations"

const DAY_MILLISECONDS = 86_400_000
const DAYS_PER_WEEK = 7
const WEEKS_SHOWN_AS_WEEKS = 5

const capitalized = (text: string, language: SupportedLanguage): string =>
  `${text.slice(0, 1).toLocaleUpperCase(intlTags[language])}${text.slice(1)}`

const formatPart = (
  date: DateTime.Utc,
  {
    language,
    options,
  }: Readonly<{ language: SupportedLanguage; options: Intl.DateTimeFormatOptions }>,
): string =>
  new Intl.DateTimeFormat(intlTags[language], { ...options, timeZone: "UTC" }).format(
    DateTime.toDateUtc(date),
  )

/** The full date, for tooltips beside a relative one. */
export const formatFullDate = (date: DateTime.Utc, language: SupportedLanguage): string =>
  DateTime.format(date, { locale: intlTags[language], dateStyle: "medium", timeZone: "UTC" })

/** The concise relative form cards use: "Today", "3 days ago", "In August", "March 2024". */
export const formatRelativeDate = ({
  date,
  today,
  language,
}: Readonly<{ date: DateTime.Utc; today: DateTime.Utc; language: SupportedLanguage }>): string => {
  const daysApart = Math.round(
    (DateTime.toEpochMillis(DateTime.startOf(today, "day")) -
      DateTime.toEpochMillis(DateTime.startOf(date, "day"))) /
      DAY_MILLISECONDS,
  )

  const weeksApart = Math.floor(daysApart / DAYS_PER_WEEK)
  const relative = (numeric: "auto" | "always") =>
    new Intl.RelativeTimeFormat(intlTags[language], { numeric })

  if (daysApart >= 0 && daysApart < DAYS_PER_WEEK) {
    return capitalized(relative("auto").format(-daysApart, "day"), language)
  }
  if (weeksApart > 0 && weeksApart < WEEKS_SHOWN_AS_WEEKS) {
    return capitalized(relative("always").format(-weeksApart, "week"), language)
  }
  if (DateTime.getPartUtc(date, "year") === DateTime.getPartUtc(today, "year")) {
    const month = formatPart(date, { language, options: { month: "long" } })
    return translatorFor(language)._(msg`In ${month}`)
  }
  return capitalized(
    formatPart(date, { language, options: { month: "long", year: "numeric" } }),
    language,
  )
}
