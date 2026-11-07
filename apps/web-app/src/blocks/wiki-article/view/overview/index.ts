import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { PartialDate } from "@gororobas/domain/common/utils/dates"
import { msg, select } from "@lingui/core/macro"
import { Array as EffectArray, Match, Option } from "effect"
import type { Html } from "foldkit/html"

import { formatPartialDate } from "../../../../lib/partial-dates"
import { type Translator, translateLabels, translatorFor } from "../../../../lib/translations"
import {
  animalRoleLabels,
  entityTypeLabels,
  resourceFormatLabels,
  placeKindLabels,
  toolUsageLabels,
} from "../../../../lib/vocabulary"
import { nameGender } from "../../../../lib/wiki-article-names"
import type { WikiArticleViewBuilder } from "../../composition"
import * as ExternalData from "../external-data"
import type { Page } from "../shared"
import {
  chipFact,
  freeChipFact,
  identifierFact,
  linkFact,
  namesFact,
  overviewCard,
  textFact,
} from "./facts"
import * as Plant from "./plant"

const joined = (maybeValues: Option.Option<ReadonlyArray<string>>): Option.Option<string> =>
  Option.map(Option.filter(maybeValues, EffectArray.isReadonlyArrayNonEmpty), (values) =>
    values.join(", "),
  )

/** Living beings go by scientific names; the header shows the first one. */
export const scientificNames = (page: Page): ReadonlyArray<string> =>
  Match.value(page).pipe(
    Match.withReturnType<ReadonlyArray<string>>(),
    Match.discriminator("kind")("PLANT", (plant) => Plant.plantTraits(plant).scientificNames),
    Match.discriminator("kind")(
      "PLANT_CULTIVAR",
      (cultivar) => Plant.cultivarTraits(cultivar).scientificNames,
    ),
    Match.discriminator("kind")("ANIMAL", (animal) =>
      Option.getOrElse(animal.attributes.scientificNames, () => []),
    ),
    Match.orElse(() => []),
  )

/** Every kind's other names; scientific names only when there's more than the header's one. */
type FactInputs = Readonly<{ page: Page; language: SupportedLanguage; i18n: Translator }>

const namingFacts = (
  { page, i18n }: FactInputs,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const allScientificNames = scientificNames(page)

  return [
    ...namesFact(
      {
        title: i18n._(msg`${select(nameGender(page), { other: "Also known as" })}`),
        names: EffectArray.drop(page.commonNames, 1).map((name) => name.name),
      },
      h,
    ),
    ...namesFact(
      {
        title: i18n._(msg`Scientific names`),
        names: allScientificNames.length > 1 ? allScientificNames : [],
      },
      h,
    ),
  ]
}

const kindFacts = (
  { page, language, i18n }: FactInputs,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const date = (maybeDate: Option.Option<PartialDate>) =>
    Option.map(maybeDate, (partialDate) => formatPartialDate(partialDate, language))

  return Match.value(page).pipe(
    Match.withReturnType<ReadonlyArray<Html>>(),
    Match.discriminatorsExhaustive("kind")({
      PLANT: (plant) =>
        Plant.facts({ page: plant, traits: Plant.plantTraits(plant), language, i18n }, h),
      PLANT_CULTIVAR: (cultivar) =>
        Plant.facts({ page: cultivar, traits: Plant.cultivarTraits(cultivar), language, i18n }, h),
      ANIMAL: ({ attributes }) =>
        chipFact(
          {
            id: "animal-role",
            title: i18n._(msg`Roles in the agroecosystem`),
            maybeValues: attributes.roles,
            labels: translateLabels(i18n, animalRoleLabels),
          },
          h,
        ),
      PLACE: ({ attributes }) => [
        ...chipFact(
          {
            id: "place-kind",
            title: i18n._(msg`Kind of place`),
            maybeValues: Option.map(attributes.placeKind, (placeKind) => [placeKind]),
            labels: translateLabels(i18n, placeKindLabels),
          },
          h,
        ),
        ...identifierFact(
          {
            title: "Wikidata",
            maybeId: attributes.wikidataId,
            toUrl: (id) => new URL(`https://www.wikidata.org/wiki/${id}`),
          },
          h,
        ),
        ...identifierFact(
          {
            title: "GeoNames",
            maybeId: attributes.geonamesId,
            toUrl: (id) => new URL(`https://www.geonames.org/${id}`),
          },
          h,
        ),
        ...identifierFact(
          {
            title: "Who's On First",
            maybeId: attributes.whosOnFirstId,
            toUrl: (id) => new URL(`https://spelunker.whosonfirst.org/id/${id}`),
          },
          h,
        ),
      ],
      TOOL: ({ attributes }) =>
        chipFact(
          {
            id: "tool-usage",
            title: i18n._(msg`Uses`),
            maybeValues: attributes.usage,
            labels: translateLabels(i18n, toolUsageLabels),
          },
          h,
        ),
      BOOK: ({ attributes }) => [
        ...textFact({ title: i18n._(msg`Authors`), maybeText: joined(attributes.authors) }, h),
        ...textFact({ title: i18n._(msg`Publisher`), maybeText: attributes.publisher }, h),
        ...textFact(
          {
            title: i18n._(msg`Published`),
            maybeText: date(attributes.publicationDate),
          },
          h,
        ),
        ...textFact({ title: i18n._(msg`Edition`), maybeText: attributes.edition }, h),
        ...textFact(
          {
            title: i18n._(msg`Pages`),
            maybeText: Option.map(attributes.pageCount, (count) => `${count}`),
          },
          h,
        ),
        ...textFact({ title: i18n._(msg`Language`), maybeText: attributes.language }, h),
        ...textFact(
          { title: "ISBN", maybeText: Option.orElse(attributes.isbn13, () => attributes.isbn10) },
          h,
        ),
        ...linkFact({ title: i18n._(msg`Where to find it`), maybeUrl: attributes.url }, h),
      ],
      FILM: ({ attributes }) => [
        ...textFact(
          { title: i18n._(msg`Directed by`), maybeText: joined(attributes.directors) },
          h,
        ),
        ...textFact(
          {
            title: i18n._(msg`Released`),
            maybeText: date(attributes.releaseDate),
          },
          h,
        ),
        ...textFact({ title: i18n._(msg`Country`), maybeText: attributes.country }, h),
        ...textFact({ title: i18n._(msg`Languages`), maybeText: joined(attributes.languages) }, h),
        ...freeChipFact({ title: i18n._(msg`Genres`), maybeValues: attributes.genres }, h),
        ...linkFact(
          {
            title: i18n._(msg`Where to watch it`),
            // Films keep their address as text, validated when it was written.
            maybeUrl: Option.flatMap(attributes.url, (url) => Option.fromNullishOr(URL.parse(url))),
          },
          h,
        ),
      ],
      RESOURCE: ({ attributes }) => [
        ...chipFact(
          {
            id: "resource-format",
            title: i18n._(msg`Format`),
            maybeValues: Option.some([attributes.format]),
            labels: translateLabels(i18n, resourceFormatLabels),
          },
          h,
        ),
        ...textFact({ title: i18n._(msg`Credits`), maybeText: attributes.creditLine }, h),
        ...linkFact(
          { title: i18n._(msg`Where to access it`), maybeUrl: Option.some(attributes.url) },
          h,
        ),
      ],
      NOTEWORTHY_ENTITY: ({ attributes }) => [
        ...chipFact(
          {
            id: "entity-type",
            title: i18n._(msg`Kind of organization`),
            maybeValues: Option.some([attributes.entityType]),
            labels: translateLabels(i18n, entityTypeLabels),
          },
          h,
        ),
        ...textFact(
          {
            title: i18n._(msg`Founded`),
            maybeText: date(attributes.foundedDate),
          },
          h,
        ),
        ...textFact(
          {
            title: i18n._(msg`Dissolved`),
            maybeText: date(attributes.dissolvedDate),
          },
          h,
        ),
        ...linkFact({ title: i18n._(msg`Website`), maybeUrl: attributes.url }, h),
      ],
      CONCEPT: () => [],
      UNCATEGORIZED: ({ attributes }) =>
        textFact(
          {
            title: i18n._(msg`Suggested kind`),
            maybeDescription: Option.some(i18n._(msg`Until someone classifies this article`)),
            maybeText: attributes.suggestedKind,
          },
          h,
        ),
    }),
  )
}

/** The facts each kind of article is known by, in one card. */
export const view = (
  { page, language }: Readonly<{ page: Page; language: SupportedLanguage }>,
  h: WikiArticleViewBuilder,
): Html => {
  const i18n = translatorFor(language)
  const inputs = { page, language, i18n }

  return overviewCard(
    {
      facts: [
        ...namingFacts(inputs, h),
        ...kindFacts(inputs, h),
        ...ExternalData.wikipediaFact(inputs, h),
      ],
      i18n,
    },
    h,
  )
}
