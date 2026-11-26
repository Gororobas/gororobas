import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import { PlaceClimateState } from "@gororobas/domain/places/climate-profile"
import { msg } from "@lingui/core/macro"
import { Style } from "@pleat/core"
import { DateTime } from "effect"
import type { Html } from "foldkit/html"

import { intlTags } from "../../../../lib/language"
import { translatorFor } from "../../../../lib/translations"
import { AppText } from "../../../../ui/app-text"
import { styledAttributes } from "../../../../ui/pleat-attributes"
import { borderWidth, radius, space, tones } from "../../../../ui/theme"
import type { ProfileLocationsEditorViewBuilder } from "./composition"

const panelStyle = Style.make({
  display: "grid",
  gap: space[2],
  padding: space[3],
  borderRadius: radius.md,
  borderWidth: borderWidth.hairline,
  borderStyle: "solid",
  borderColor: tones.secondary.shade[300],
  backgroundColor: tones.secondary.shade[100],
})

const summaryStyle = Style.make({ display: "flex", flexWrap: "wrap", gap: space[3] })

const chartStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
  columnGap: space[1],
  minWidth: "32rem",
})

const monthStyle = Style.make({
  display: "grid",
  gridTemplateRows: "auto 5rem auto",
  justifyItems: "center",
  minWidth: 0,
})

const barStyle = Style.make({
  alignSelf: "end",
  width: "85%",
  height: "var(--monthly-rain-height)",
  borderRadius: radius.sm,
  backgroundColor: tones.secondary.shade[700],
})

const detailsStyle = Style.make({ overflowX: "auto" })
const summaryButtonStyle = Style.make({ cursor: "pointer" })
const cellStyle = Style.make({ padding: space[1], textAlign: "start" })

// Number of days in each month, averaged over the CHELSA baseline.
const days = [31, 28 + 7 / 30, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

export const climateProfileView = (
  { climate, language }: Readonly<{ climate: PlaceClimateState; language: SupportedLanguage }>,
  h: ProfileLocationsEditorViewBuilder,
): Html => {
  const i18n = translatorFor(language)
  const text = (label: string, isMuted = false) =>
    AppText.view({ element: "p", appearance: "footnote", isMuted, children: [label] }, h)
  if (PlaceClimateState.guards.Generating(climate)) {
    return h.div([h.Role("status")], [text(i18n._(msg`Generating climate profile…`), true)])
  }
  if (PlaceClimateState.guards.Unavailable(climate)) {
    return text(i18n._(msg`Climate profile unavailable. Save the place again to retry.`), true)
  }

  const { profile } = climate
  const locale = intlTags[language]
  const number = (value: number, digits = 0) =>
    value.toLocaleString(locale, { maximumFractionDigits: digits })
  const monthName = DateTime.format({ locale, month: "short", timeZone: "UTC" })

  const months = profile.months.map((month) => ({
    ...month,
    label: monthName(DateTime.makeUnsafe({ year: 2000, month: month.month, day: 1 })).replace(
      /\.$/,
      "",
    ),
  }))

  const rainfall = number(months.reduce((total, month) => total + month.precipitationMm.mean, 0))

  const temperature = number(
    months.reduce(
      (total, month) => total + month.temperatureC.mean * (days[month.month - 1] ?? 0),
      0,
    ) /
      (365 + 7 / 30),
    1,
  )

  const chart = (field: "precipitationMm" | "temperatureC", unit: string) => {
    const values = months.map((month) => month[field].mean)
    const floor = Math.min(0, Math.floor(Math.min(...values)))
    const ceiling = Math.max(floor + 1, Math.ceil(Math.max(...values)))

    return h.div(styledAttributes([], detailsStyle), [
      text(`${number(floor)}–${number(ceiling)} ${unit}`, true),
      h.div(
        styledAttributes([], chartStyle),
        months.map((month) =>
          h.div(styledAttributes([], monthStyle), [
            text(number(month[field].mean, field === "temperatureC" ? 1 : 0)),
            h.div(
              styledAttributes(
                [
                  h.AriaHidden(true),
                  h.Attribute(
                    "style",
                    `--monthly-rain-height: ${(100 * (month[field].mean - floor)) / (ceiling - floor)}%`,
                  ),
                ],
                barStyle,
              ),
            ),
            text(month.label, true),
          ]),
        ),
      ),
    ])
  }

  const range = (value: (typeof months)[number]["temperatureC"], digits: number) =>
    `${number(value.mean, digits)} (${number(value.p10, digits)}–${number(value.p90, digits)})`

  const dimensions = [
    ["minimumTemperatureC", i18n._(msg`Mean daily minimum (°C)`), 1],
    ["maximumTemperatureC", i18n._(msg`Mean daily maximum (°C)`), 1],
    ["relativeHumidityPercent", i18n._(msg`Relative humidity (%)`), 1],
    ["potentialEvapotranspirationMm", i18n._(msg`Potential evapotranspiration (mm)`), 1],
    ["vaporPressureDeficitKpa", i18n._(msg`Vapor pressure deficit (kPa)`), 2],
    ["shortwaveRadiationWm2", i18n._(msg`Shortwave radiation (W/m²)`), 1],
  ] as const

  const elevation = profile.elevationMeters
  const support = number(profile.supportFraction * 100, 2)

  const coverage = number(
    Math.min(
      ...months.flatMap((month) => [
        month.temperatureC.coverage,
        month.precipitationMm.coverage,
        ...dimensions.map(([key]) => month[key].coverage),
      ]),
    ) * 100,
  )

  const source = `${profile.dataset} · ${profile.baseline} · ${profile.boundarySource}${profile.boundaryVersion === null ? "" : ` ${profile.boundaryVersion}`}`

  return h.section(styledAttributes([h.AriaLabel(i18n._(msg`Climate profile`))], panelStyle), [
    AppText.view(
      { element: "h4", weight: "semibold", children: [i18n._(msg`Climate profile`)] },
      h,
    ),
    h.div(styledAttributes([], summaryStyle), [
      text(i18n._(msg`Annual mean temperature ${temperature} °C`)),
      text(i18n._(msg`Annual rainfall ${rainfall} mm`)),
    ]),
    text(i18n._(msg`Rainfall by month`)),
    chart("precipitationMm", "mm"),
    text(i18n._(msg`Temperature by month`)),
    chart("temperatureC", "°C"),
    text(source, true),
    text(
      elevation === null
        ? i18n._(msg`Whole municipality`)
        : i18n._(
            msg`Terrain within 50 m of ${elevation} m · ${support}% of municipality · Copernicus GLO-90`,
          ),
      true,
    ),
    text(i18n._(msg`Minimum area coverage ${coverage}%`), true),
    h.details(styledAttributes([], detailsStyle), [
      h.summary(styledAttributes([], summaryButtonStyle), [
        i18n._(msg`Monthly means and P10–P90 ranges`),
      ]),
      h.table(
        [],
        [
          h.thead(
            [],
            [
              h.tr(
                [],
                [
                  h.th(styledAttributes([], cellStyle), [i18n._(msg`Month`)]),
                  h.th(styledAttributes([], cellStyle), [i18n._(msg`Temperature (°C)`)]),
                  h.th(styledAttributes([], cellStyle), [i18n._(msg`Rainfall (mm)`)]),
                  ...dimensions.map(([, label]) => h.th(styledAttributes([], cellStyle), [label])),
                  h.th(styledAttributes([], cellStyle), [
                    i18n._(msg`Estimated daylight on the 15th (h)`),
                  ]),
                ],
              ),
            ],
          ),
          h.tbody(
            [],
            months.map((month) =>
              h.tr(
                [],
                [
                  h.th(styledAttributes([h.Attribute("scope", "row")], cellStyle), [month.label]),
                  h.td(styledAttributes([], cellStyle), [range(month.temperatureC, 1)]),
                  h.td(styledAttributes([], cellStyle), [range(month.precipitationMm, 0)]),
                  ...dimensions.map(([key, , digits]) =>
                    h.td(styledAttributes([], cellStyle), [range(month[key], digits)]),
                  ),
                  h.td(styledAttributes([], cellStyle), [number(month.daylightHours, 2)]),
                ],
              ),
            ),
          ),
        ],
      ),
    ]),
  ])
}
