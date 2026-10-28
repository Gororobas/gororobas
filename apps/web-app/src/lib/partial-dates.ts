import type { PartialDate } from "@gororobas/domain/common/utils/dates"
import { DateTime, Match } from "effect"

const formatMonth = DateTime.format({ locale: "pt-BR", month: "long", timeZone: "UTC" })

const monthName = (month: number): string =>
  formatMonth(DateTime.makeUnsafe({ year: 2000, month, day: 1 }))

/** Reads a date only as precisely as it was recorded: "1987", "março de 1987", "12 de março de 1987". */
export const formatPartialDate = (date: typeof PartialDate.Type): string =>
  Match.value(date).pipe(
    Match.discriminatorsExhaustive("precision")({
      year: ({ year }) => `${year}`,
      month: ({ year, month }) => `${monthName(month)} de ${year}`,
      day: ({ year, month, day }) => `${day} de ${monthName(month)} de ${year}`,
      time: ({ year, month, day }) => `${day} de ${monthName(month)} de ${year}`,
    }),
  )
