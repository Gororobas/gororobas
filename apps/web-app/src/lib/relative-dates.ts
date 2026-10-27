import { DateTime } from "effect"

const DAY_MILLISECONDS = 86_400_000
const DAYS_PER_WEEK = 7
const WEEKS_SHOWN_AS_WEEKS = 5

const monthName = (date: DateTime.Utc): string => {
  const month = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
    DateTime.toDateUtc(date),
  )
  return `${month.slice(0, 1).toLocaleUpperCase("pt-BR")}${month.slice(1)}`
}

/** The full date, for tooltips beside a relative one. */
export const formatFullDate = DateTime.format({
  locale: "pt-BR",
  dateStyle: "medium",
  timeZone: "UTC",
})

/** The concise relative form cards use: "Hoje", "Há 3 dias", "Em Agosto", "Março de 2024". */
export const formatRelativeDate = (date: DateTime.Utc, today: DateTime.Utc): string => {
  const daysApart = Math.round(
    (DateTime.toEpochMillis(DateTime.startOf(today, "day")) -
      DateTime.toEpochMillis(DateTime.startOf(date, "day"))) /
      DAY_MILLISECONDS,
  )

  const weeksApart = Math.floor(daysApart / DAYS_PER_WEEK)

  if (daysApart === 0) return "Hoje"
  if (daysApart === 1) return "Ontem"
  if (daysApart > 1 && daysApart < DAYS_PER_WEEK) return `Há ${daysApart} dias`
  if (weeksApart > 0 && weeksApart < WEEKS_SHOWN_AS_WEEKS) {
    return weeksApart === 1 ? "Há 1 semana" : `Há ${weeksApart} semanas`
  }
  if (DateTime.getPartUtc(date, "year") === DateTime.getPartUtc(today, "year")) {
    return `Em ${monthName(date)}`
  }
  return `${monthName(date)} de ${DateTime.getPartUtc(date, "year")}`
}
