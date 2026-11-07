import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import { capitalize } from "@gororobas/domain/common/utils/strings"
import { msg } from "@lingui/core/macro"
import { DateTime, Duration } from "effect"

import { intlTags } from "./language"
import { translatorFor } from "./translations"

const DAYS_PER_WEEK = 7
const WEEKS_SHOWN_AS_WEEKS = 5

/** The full date, for tooltips beside a relative one. */
export const formatFullDate = (date: DateTime.Utc, language: SupportedLanguage): string =>
  DateTime.formatUtc(date, { locale: intlTags[language], dateStyle: "medium" })

/** The concise relative form cards use: "Today", "3 days ago", "In August", "March 2024". */
export const formatRelativeDate = ({
  date,
  today,
  language,
}: Readonly<{ date: DateTime.Utc; today: DateTime.Utc; language: SupportedLanguage }>): string => {
  const locale = intlTags[language]

  const daysApart = Math.round(
    Duration.toDays(
      DateTime.distance(DateTime.startOf(date, "day"), DateTime.startOf(today, "day")),
    ),
  )

  const weeksApart = Math.floor(daysApart / DAYS_PER_WEEK)
  const relative = (numeric: "auto" | "always") => new Intl.RelativeTimeFormat(locale, { numeric })

  if (daysApart >= 0 && daysApart < DAYS_PER_WEEK) {
    return capitalize(relative("auto").format(-daysApart, "day"), false)
  }
  if (weeksApart > 0 && weeksApart < WEEKS_SHOWN_AS_WEEKS) {
    return capitalize(relative("always").format(-weeksApart, "week"), false)
  }
  if (DateTime.getPartUtc(date, "year") === DateTime.getPartUtc(today, "year")) {
    const month = DateTime.formatUtc(date, { locale, month: "long" })
    return translatorFor(language)._(msg`In ${month}`)
  }
  return capitalize(DateTime.formatUtc(date, { locale, month: "long", year: "numeric" }), false)
}
