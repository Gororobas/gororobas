import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type {
  WikiArticleQueriedPageData,
  WikiCultivarParentPlant,
  WikiPlantArticle,
} from "@gororobas/domain/wiki/domain"
import type { MessageDescriptor } from "@lingui/core"
import { msg, plural, select } from "@lingui/core/macro"
import { Style } from "@pleat/core"
import { Array as EffectArray, Function, Match, Number as EffectNumber, Option } from "effect"
import * as Length from "effect-units/Length"
import * as Temperature from "effect-units/Temperature"
import type { Html } from "foldkit/html"

import { intlTags } from "../../../../lib/language"
import { type Translator, translateLabels } from "../../../../lib/translations"
import {
  ediblePartLabels,
  lifecycleExplainers,
  lifecycleLabels,
  plantUsageLabels,
  plantingMethodExplainers,
  plantingMethodLabels,
  stratumExplainers,
  stratumLabels,
} from "../../../../lib/vocabulary"
import { nameParts } from "../../../../lib/wiki-article-names"
import { styledAttributes } from "../../../../ui/pleat-attributes"
import { fontSize, fontWeight, radius, space, tones } from "../../../../ui/theme"
import type { WikiArticleViewBuilder } from "../../composition"
import { chipFact, fact, rangeText, textFact } from "./facts"

type PlantPage = typeof WikiPlantArticle.QueriedPageData.Type
type CultivarPage = Extract<WikiArticleQueriedPageData, { kind: "PLANT_CULTIVAR" }>
type PlantAttributes = PlantPage["attributes"]

type Range<A> = Readonly<{ minimum: A; maximum: A }>

/** A trait's value, and for cultivars, a note when it comes from the parent plant. */
type Trait<A> = Readonly<{
  maybeValue: Option.Option<A>
  maybeNote: Option.Option<MessageDescriptor>
}>

/** What plants and their cultivars both describe, each trait absent until someone records it. */
export type PlantTraits = Readonly<{
  scientificNames: ReadonlyArray<string>
  usage: Trait<Option.Option.Value<PlantAttributes["usage"]>>
  edibleParts: Trait<Option.Option.Value<PlantAttributes["edibleParts"]>>
  strata: Trait<Option.Option.Value<PlantAttributes["strata"]>>
  lifecycles: Trait<Option.Option.Value<PlantAttributes["lifecycles"]>>
  plantingMethods: Trait<Option.Option.Value<PlantAttributes["plantingMethods"]>>
  developmentCycle: Trait<Range<number>>
  height: Trait<Range<Option.Option.Value<PlantAttributes["heightMin"]>>>
  temperature: Trait<Range<Option.Option.Value<PlantAttributes["temperatureMin"]>>>
}>

const own = <A>(maybeValue: Option.Option<A>): Trait<A> => ({
  maybeValue,
  maybeNote: Option.none(),
})

const ranges = (attributes: PlantAttributes) => ({
  developmentCycle: Option.all({
    minimum: attributes.developmentCycleMin,
    maximum: attributes.developmentCycleMax,
  }),
  height: Option.all({ minimum: attributes.heightMin, maximum: attributes.heightMax }),
  temperature: Option.all({
    minimum: attributes.temperatureMin,
    maximum: attributes.temperatureMax,
  }),
})

export const plantTraits = ({ attributes }: PlantPage): PlantTraits => {
  const { developmentCycle, height, temperature } = ranges(attributes)

  return {
    scientificNames: Option.getOrElse(attributes.scientificNames, () => []),
    usage: own(attributes.usage),
    edibleParts: own(attributes.edibleParts),
    strata: own(attributes.strata),
    lifecycles: own(attributes.lifecycles),
    plantingMethods: own(attributes.plantingMethods),
    developmentCycle: own(developmentCycle),
    height: own(height),
    temperature: own(temperature),
  }
}

type CultivarProperty<A> = Readonly<
  { _tag: "Unknown" } | { _tag: "Inherit" } | { _tag: "Value"; value: A }
>

const fromMinMax = <A>({ min, max }: Readonly<{ min: A; max: A }>): Range<A> => ({
  minimum: min,
  maximum: max,
})

/**
 * Inherited traits read from the parent plant. Unknown ones show the plant's value too, flagged
 * as possibly different, since it's the best guess a grower has.
 */
export const cultivarTraits = ({ attributes, parentPlant }: CultivarPage): PlantTraits => {
  const maybeParentName = Option.map(parentPlant, ({ card }) => nameParts(card))
  const parentValues = Option.map(parentPlant, (parent: WikiCultivarParentPlant) => ({
    ...parent.attributes,
    ...ranges(parent.attributes),
  }))

  const trait = <A, B>({
    property,
    toValue,
    fromParent,
  }: Readonly<{
    property: CultivarProperty<A>
    toValue: (value: A) => B
    fromParent: (parent: Option.Option.Value<typeof parentValues>) => Option.Option<B>
  }>): Trait<B> => {
    const inParent = Option.flatMap(parentValues, fromParent)

    return Match.value(property).pipe(
      Match.discriminatorsExhaustive("_tag")({
        Value: ({ value }) => own(Option.some(toValue(value))),
        Inherit: () => ({
          maybeValue: inParent,
          maybeNote: Option.map(
            maybeParentName,
            ({ name, gender }) => msg`${select(gender, { other: `Inherited from ${name}` })}`,
          ),
        }),
        Unknown: () => ({
          maybeValue: inParent,
          maybeNote: Option.map(
            maybeParentName,
            ({ name, gender }) =>
              msg`${select(gender, { other: `${name}'s value, may differ in this variety` })}`,
          ),
        }),
      }),
    )
  }

  return {
    scientificNames: Match.value(attributes.scientificNames).pipe(
      Match.discriminatorsExhaustive("_tag")({
        Value: ({ value }) => value,
        Inherit: () =>
          Option.getOrElse(
            Option.flatMap(parentValues, (parent) => parent.scientificNames),
            () => [],
          ),
        Unknown: () => [],
      }),
    ),
    usage: trait({
      property: attributes.usage,
      toValue: Function.identity,
      fromParent: (parent) => parent.usage,
    }),
    edibleParts: trait({
      property: attributes.edibleParts,
      toValue: Function.identity,
      fromParent: (parent) => parent.edibleParts,
    }),
    strata: trait({
      property: attributes.strata,
      toValue: Function.identity,
      fromParent: (parent) => parent.strata,
    }),
    lifecycles: trait({
      property: attributes.lifecycles,
      toValue: Function.identity,
      fromParent: (parent) => parent.lifecycles,
    }),
    plantingMethods: trait({
      property: attributes.plantingMethods,
      toValue: Function.identity,
      fromParent: (parent) => parent.plantingMethods,
    }),
    developmentCycle: trait({
      property: attributes.developmentCycle,
      toValue: fromMinMax,
      fromParent: (parent) => parent.developmentCycle,
    }),
    height: trait({
      property: attributes.height,
      toValue: fromMinMax,
      fromParent: (parent) => parent.height,
    }),
    temperature: trait({
      property: attributes.temperature,
      toValue: fromMinMax,
      fromParent: (parent) => parent.temperature,
    }),
  }
}

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
  color: tones.neutral.shade[700],
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

const formatLength = (length: Length.Length, language: SupportedLanguage): string => {
  const centimeters = Length.inCentimeters(length)
  return centimeters >= 100
    ? `${EffectNumber.round(Length.inMeters(length), 1).toLocaleString(intlTags[language])}m`
    : `${Math.round(centimeters)}cm`
}

const temperatureScale = (
  { minimum, maximum, i18n }: Range<number> & Readonly<{ i18n: Translator }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.div(
    styledAttributes(
      [h.Role("img"), h.AriaLabel(i18n._(msg`Between ${minimum}ºC and ${maximum}ºC`))],
      scaleStyle,
    ),
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
                : tones.neutral.shade[100],
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
export const facts = (
  {
    page,
    traits,
    language,
    i18n,
  }: Readonly<{
    page: PlantPage | CultivarPage
    traits: PlantTraits
    language: SupportedLanguage
    i18n: Translator
  }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const note = <A>(trait: Trait<A>) =>
    Option.map(trait.maybeNote, (descriptor) => i18n._(descriptor))
  const range = (minimum: string, maximum: string) => rangeText({ minimum, maximum, i18n })

  return [
    ...(page.kind === "PLANT"
      ? textFact({ title: i18n._(msg`Origin`), maybeText: page.origin }, h)
      : []),
    ...chipFact(
      {
        id: "usage",
        title: i18n._(msg`Main uses`),
        maybeValues: traits.usage.maybeValue,
        maybeNote: note(traits.usage),
        labels: translateLabels(i18n, plantUsageLabels),
      },
      h,
    ),
    ...chipFact(
      {
        id: "edible-parts",
        title: i18n._(msg`Edible parts`),
        maybeValues: traits.edibleParts.maybeValue,
        maybeNote: note(traits.edibleParts),
        labels: translateLabels(i18n, ediblePartLabels),
      },
      h,
    ),
    ...chipFact(
      {
        id: "stratum",
        title: i18n._(msg`Stratum`),
        maybeDescription: Option.some(i18n._(msg`Vertical layer, by how much light it needs`)),
        maybeValues: traits.strata.maybeValue,
        maybeNote: note(traits.strata),
        labels: translateLabels(i18n, stratumLabels),
        explainers: translateLabels(i18n, stratumExplainers),
      },
      h,
    ),
    ...chipFact(
      {
        id: "lifecycle",
        title: i18n._(msg`Lifecycle`),
        maybeDescription: Option.some(i18n._(msg`From planting until it dies or is harvested`)),
        maybeValues: traits.lifecycles.maybeValue,
        maybeNote: note(traits.lifecycles),
        labels: translateLabels(i18n, lifecycleLabels),
        explainers: translateLabels(i18n, lifecycleExplainers),
      },
      h,
    ),
    ...chipFact(
      {
        id: "planting-method",
        title: i18n._(msg`Planting and propagation methods`),
        maybeValues: traits.plantingMethods.maybeValue,
        maybeNote: note(traits.plantingMethods),
        labels: translateLabels(i18n, plantingMethodLabels),
        explainers: translateLabels(i18n, plantingMethodExplainers),
      },
      h,
    ),
    ...textFact(
      {
        title: i18n._(msg`Time to harvest`),
        maybeDescription: Option.some(i18n._(msg`How long until we start harvesting`)),
        maybeText: Option.map(traits.developmentCycle.maybeValue, ({ minimum, maximum }) =>
          minimum === maximum
            ? i18n._(msg`${plural(minimum, { one: "# day", other: "# days" })}`)
            : i18n._(msg`${minimum} to ${maximum} days`),
        ),
        maybeNote: note(traits.developmentCycle),
      },
      h,
    ),
    ...textFact(
      {
        title: i18n._(msg`${select(nameParts(page).gender, { other: "Height when fully grown" })}`),
        maybeText: Option.map(traits.height.maybeValue, ({ minimum, maximum }) =>
          range(formatLength(minimum, language), formatLength(maximum, language)),
        ),
        maybeNote: note(traits.height),
      },
      h,
    ),
    ...EffectArray.fromOption(
      Option.map(traits.temperature.maybeValue, ({ minimum, maximum }) =>
        fact(
          {
            title: i18n._(msg`Ideal temperature`),
            maybeNote: note(traits.temperature),
            content: temperatureScale(
              {
                minimum: Math.round(Temperature.inDegreesCelsius(minimum)),
                maximum: Math.round(Temperature.inDegreesCelsius(maximum)),
                i18n,
              },
              h,
            ),
          },
          h,
        ),
      ),
    ),
  ]
}
