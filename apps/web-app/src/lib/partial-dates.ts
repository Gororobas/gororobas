import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { PartialDate } from "@gororobas/domain/common/utils/dates"
import { DateTime, Match } from "effect"

import { intlTags } from "./language"

const formatter = (language: SupportedLanguage, options: Intl.DateTimeFormatOptions) =>
  DateTime.format({ locale: intlTags[language], timeZone: "UTC", ...options })

/** Reads a date only as precisely as it was recorded: "1987", "March 1987", "March 12, 1987". */
export const formatPartialDate = (date: PartialDate, language: SupportedLanguage): string =>
  Match.value(date).pipe(
    Match.discriminatorsExhaustive("precision")({
      year: ({ year }) => `${year}`,
      month: ({ year, month }) =>
        formatter(language, { year: "numeric", month: "long" })(
          DateTime.makeUnsafe({ year, month, day: 1 }),
        ),
      day: ({ year, month, day }) =>
        formatter(language, { dateStyle: "long" })(DateTime.makeUnsafe({ year, month, day })),
      time: ({ year, month, day }) =>
        formatter(language, { dateStyle: "long" })(DateTime.makeUnsafe({ year, month, day })),
    }),
  )
