import type { WikiPlantArticle } from "@gororobas/domain/wiki/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Number as EffectNumber, Option } from "effect"
import * as Length from "effect-units/Length"
import * as Temperature from "effect-units/Temperature"
import type { Html } from "foldkit/html"

import {
  ediblePartLabels,
  lifecycleExplainers,
  lifecycleLabels,
  plantUsageLabels,
  plantingMethodExplainers,
  plantingMethodLabels,
  stratumExplainers,
  stratumLabels,
} from "../../../lib/vocabulary"
import { agreeingWith } from "../../../lib/wiki-article-names"
import { AppText } from "../../../ui/app-text"
import { Chip } from "../../../ui/chip"
import * as Icons from "../../../ui/icons"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { SectionCard } from "../../../ui/section-card"
import {
  borderWidth,
  breakpoint,
  fontSize,
  fontWeight,
  radius,
  space,
  tones,
} from "../../../ui/theme"
import type { WikiArticleViewBuilder } from "../composition"

type PlantPage = typeof WikiPlantArticle.QueriedPageData.Type

const factsStyle = Style.make({ display: "grid" })

/** Label and description on the left, values on the right, as on gororobas.com. */
const factStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)",
  alignItems: "start",
  columnGap: space[4],
  paddingBlock: space[3],
  borderBlockStart: `${borderWidth.hairline} solid ${tones.primary.ramp[300]}`,
}).pipe(
  Style.when(When.firstChild, { borderBlockStart: 0, paddingBlockStart: 0 }),
  Style.when(breakpoint.sm, { gridTemplateColumns: "minmax(0, 12.5rem) minmax(0, 1fr)" }),
)

const factLabelStyle = Style.make({ display: "grid", rowGap: space[1] })
const factTitleStyle = Style.make({ color: tones.neutral.ramp[800] })
const factDescriptionStyle = Style.make({ color: tones.neutral.ramp[600] })

const chipsStyle = Style.make({ display: "flex", flexWrap: "wrap", gap: space[2] })

const namesStyle = Style.make({ display: "flex", flexWrap: "wrap", columnGap: space[3] })

const scaleStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "repeat(8, 1fr)",
  gap: space[1],
  paddingBlockStart: space[2],
})

const segmentStyle = Style.make({ blockSize: "0.5rem", borderRadius: radius.full })

const scaleLabelStyle = Style.make({
  gridRow: 2,
  fontSize: fontSize.footnote,
  fontWeight: fontWeight.medium,
  color: tones.neutral.ramp[700],
})

/** The scale runs 0–40ºC in 5º steps; warmer steps of the plant's range get warmer colors. */
const TEMPERATURE_STEP = 5
const TEMPERATURE_SEGMENTS = 8

const warmthColors = [
  tones.accent.ramp[200],
  tones.accent.ramp[200],
  tones.accent.ramp[300],
  tones.accent.ramp[300],
  tones.primary.ramp[300],
  tones.primary.ramp[400],
  tones.primary.ramp[500],
  tones.secondary.ramp[300],
] as const

const fact = (
  {
    title,
    maybeDescription,
    content,
  }: Readonly<{ title: string; maybeDescription: Option.Option<string>; content: Html }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.div(styledAttributes([], factStyle), [
    h.div(styledAttributes([], factLabelStyle), [
      AppText.view(
        {
          element: "h3",
          appearance: "regular",
          weight: "semibold",
          lineHeight: "tight",
          styles: [factTitleStyle],
          children: [title],
        },
        h,
      ),
      ...EffectArray.fromOption(
        Option.map(maybeDescription, (description) =>
          AppText.view(
            {
              element: "p",
              appearance: "footnote",
              lineHeight: "tight",
              styles: [factDescriptionStyle],
              children: [description],
            },
            h,
          ),
        ),
      ),
    ]),
    content,
  ])

const chipFact = <Value extends string>(
  {
    id,
    title,
    maybeDescription,
    maybeValues,
    labels,
    explainers,
  }: Readonly<{
    /** Prefixes each explainer's ID, unique within the page. */
    id: string
    title: string
    maybeDescription: Option.Option<string>
    maybeValues: Option.Option<ReadonlyArray<Value>>
    labels: Readonly<Record<Value, string>>
    explainers?: Readonly<Record<Value, string>>
  }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.map(Option.filter(maybeValues, EffectArray.isReadonlyArrayNonEmpty), (values) =>
      fact(
        {
          title,
          maybeDescription,
          content: h.div(
            styledAttributes([], chipsStyle),
            values.map((value) =>
              explainers === undefined
                ? Chip.view({ label: labels[value] }, h)
                : Chip.explained(
                    {
                      id: `${id}-${value.toLowerCase()}`,
                      label: labels[value],
                      explainer: explainers[value],
                    },
                    h,
                  ),
            ),
          ),
        },
        h,
      ),
    ),
  )

const formatLength = (length: Length.Length): string => {
  const centimeters = Length.inCentimeters(length)
  return centimeters >= 100
    ? `${EffectNumber.round(Length.inMeters(length), 1).toLocaleString("pt-BR")}m`
    : `${Math.round(centimeters)}cm`
}

const rangeText = (minimum: string, maximum: string): string =>
  minimum === maximum ? minimum : `De ${minimum} a ${maximum}`

const textFact = (
  {
    title,
    maybeDescription = Option.none(),
    maybeText,
  }: Readonly<{
    title: string
    maybeDescription?: Option.Option<string>
    maybeText: Option.Option<string>
  }>,
  h: WikiArticleViewBuilder,
) =>
  EffectArray.fromOption(
    Option.map(maybeText, (text) =>
      fact(
        {
          title,
          maybeDescription,
          content: AppText.view({ element: "p", lineHeight: "tight", children: [text] }, h),
        },
        h,
      ),
    ),
  )

const temperatureScale = (
  { minimum, maximum }: Readonly<{ minimum: number; maximum: number }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.div(
    styledAttributes([h.Role("img"), h.AriaLabel(`Entre ${minimum}ºC e ${maximum}ºC`)], scaleStyle),
    [
      ...EffectArray.makeBy(TEMPERATURE_SEGMENTS, (index) => {
        const start = index * TEMPERATURE_STEP
        const isInRange = start + TEMPERATURE_STEP > minimum && start < maximum

        return h.span(
          styledAttributes(
            [],
            segmentStyle,
            Style.make({
              backgroundColor: isInRange
                ? (warmthColors[index] ?? tones.primary.ramp[400])
                : tones.neutral.ramp[100],
            }),
          ),
        )
      }),
      ...[minimum, maximum].map((value) =>
        h.span(
          styledAttributes(
            [],
            scaleLabelStyle,
            Style.make({
              gridColumn: String(
                Math.min(
                  TEMPERATURE_SEGMENTS,
                  Math.max(1, Math.floor(value / TEMPERATURE_STEP) + 1),
                ),
              ),
            }),
          ),
          [`${value}ºC`],
        ),
      ),
    ],
  )

/** What a grower needs at a glance, in the order people ask about it. */
export const view = (page: PlantPage, h: WikiArticleViewBuilder): Html => {
  const scientificNames = Option.getOrElse(page.attributes.scientificNames, () => [])
  const { attributes } = page
  const otherNames = EffectArray.drop(page.commonNames, 1).map((name) => name.name)
  const height = Option.all({ minimum: attributes.heightMin, maximum: attributes.heightMax })
  const temperature = Option.all({
    minimum: attributes.temperatureMin,
    maximum: attributes.temperatureMax,
  })
  const developmentCycle = Option.all({
    minimum: attributes.developmentCycleMin,
    maximum: attributes.developmentCycleMax,
  })

  const facts: ReadonlyArray<Html> = [
    ...EffectArray.match(otherNames, {
      onEmpty: () => [],
      onNonEmpty: (names) => [
        fact(
          {
            title: agreeingWith(page, {
              feminine: "Também conhecida como",
              otherwise: "Também conhecido como",
            }),
            maybeDescription: Option.none(),
            content: h.p(
              styledAttributes([], namesStyle),
              names.map((name) => h.span([], [name])),
            ),
          },
          h,
        ),
      ],
    }),
    ...textFact(
      {
        title: "Nomes científicos",
        maybeText: Option.liftPredicate(
          scientificNames.join(", "),
          () => scientificNames.length > 1,
        ),
      },
      h,
    ),
    ...textFact({ title: "Origem", maybeText: page.origin }, h),
    ...chipFact(
      {
        id: "usage",
        title: "Principais usos",
        maybeDescription: Option.none(),
        maybeValues: attributes.usage,
        labels: plantUsageLabels,
      },
      h,
    ),
    ...chipFact(
      {
        id: "edible-parts",
        title: "Partes comestíveis",
        maybeDescription: Option.none(),
        maybeValues: attributes.edibleParts,
        labels: ediblePartLabels,
      },
      h,
    ),
    ...chipFact(
      {
        id: "stratum",
        title: "Estrato",
        maybeDescription: Option.some("Camada vertical conforme necessidade de luz"),
        maybeValues: attributes.strata,
        labels: stratumLabels,
        explainers: stratumExplainers,
      },
      h,
    ),
    ...chipFact(
      {
        id: "lifecycle",
        title: "Ciclo de vida",
        maybeDescription: Option.some("Duração do plantio até a morte ou colheita"),
        maybeValues: attributes.lifecycles,
        labels: lifecycleLabels,
        explainers: lifecycleExplainers,
      },
      h,
    ),
    ...chipFact(
      {
        id: "planting-method",
        title: "Métodos de plantio e propagação",
        maybeDescription: Option.none(),
        maybeValues: attributes.plantingMethods,
        labels: plantingMethodLabels,
        explainers: plantingMethodExplainers,
      },
      h,
    ),
    ...textFact(
      {
        title: "Tempo até produzir",
        maybeDescription: Option.some("Quanto tempo até começarmos a colher"),
        maybeText: Option.map(
          developmentCycle,
          ({ minimum, maximum }) => `${rangeText(`${minimum}`, `${maximum}`)} dias`,
        ),
      },
      h,
    ),
    ...textFact(
      {
        title: agreeingWith(page, {
          feminine: "Altura quando adulta",
          otherwise: "Altura quando adulto",
        }),
        maybeText: Option.map(height, ({ minimum, maximum }) =>
          rangeText(formatLength(minimum), formatLength(maximum)),
        ),
      },
      h,
    ),
    ...EffectArray.fromOption(
      Option.map(temperature, ({ minimum, maximum }) =>
        fact(
          {
            title: "Temperatura ideal",
            maybeDescription: Option.none(),
            content: temperatureScale(
              {
                minimum: Math.round(Temperature.inDegreesCelsius(minimum)),
                maximum: Math.round(Temperature.inDegreesCelsius(maximum)),
              },
              h,
            ),
          },
          h,
        ),
      ),
    ),
  ]

  return EffectArray.match(facts, {
    onEmpty: () => h.empty,
    onNonEmpty: (nonEmpty) =>
      SectionCard.view(
        {
          title: "Visão geral",
          icon: Icons.clipboardCheck,
          children: [h.div(styledAttributes([], factsStyle), nonEmpty)],
        },
        h,
      ),
  })
}
