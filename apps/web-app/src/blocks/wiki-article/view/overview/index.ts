import { Array as EffectArray, Match, Option } from "effect"
import type { Html } from "foldkit/html"

import { formatPartialDate } from "../../../../lib/partial-dates"
import {
  animalRoleLabels,
  entityTypeLabels,
  resourceFormatLabels,
  toolUsageLabels,
} from "../../../../lib/vocabulary"
import { agreeingWith } from "../../../../lib/wiki-article-names"
import type { WikiArticleViewBuilder } from "../../composition"
import type { Page } from "../shared"
import { chipFact, freeChipFact, linkFact, namesFact, overviewCard, textFact } from "./facts"
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
const namingFacts = (page: Page, h: WikiArticleViewBuilder): ReadonlyArray<Html> => {
  const allScientificNames = scientificNames(page)

  return [
    ...namesFact(
      {
        title: agreeingWith(page, {
          feminine: "Também conhecida como",
          otherwise: "Também conhecido como",
        }),
        names: EffectArray.drop(page.commonNames, 1).map((name) => name.name),
      },
      h,
    ),
    ...namesFact(
      {
        title: "Nomes científicos",
        names: allScientificNames.length > 1 ? allScientificNames : [],
      },
      h,
    ),
  ]
}

const kindFacts = (page: Page, h: WikiArticleViewBuilder): ReadonlyArray<Html> =>
  Match.value(page).pipe(
    Match.withReturnType<ReadonlyArray<Html>>(),
    Match.discriminatorsExhaustive("kind")({
      PLANT: (plant) => Plant.facts({ page: plant, traits: Plant.plantTraits(plant) }, h),
      PLANT_CULTIVAR: (cultivar) =>
        Plant.facts({ page: cultivar, traits: Plant.cultivarTraits(cultivar) }, h),
      ANIMAL: ({ attributes }) =>
        chipFact(
          {
            id: "animal-role",
            title: "Papéis no agroecossistema",
            maybeValues: attributes.roles,
            labels: animalRoleLabels,
          },
          h,
        ),
      TOOL: ({ attributes }) =>
        chipFact(
          {
            id: "tool-usage",
            title: "Usos",
            maybeValues: attributes.usage,
            labels: toolUsageLabels,
          },
          h,
        ),
      BOOK: ({ attributes }) => [
        ...textFact({ title: "Autoria", maybeText: joined(attributes.authors) }, h),
        ...textFact({ title: "Editora", maybeText: attributes.publisher }, h),
        ...textFact(
          {
            title: "Publicação",
            maybeText: Option.map(attributes.publicationDate, formatPartialDate),
          },
          h,
        ),
        ...textFact({ title: "Edição", maybeText: attributes.edition }, h),
        ...textFact(
          {
            title: "Páginas",
            maybeText: Option.map(attributes.pageCount, (count) => `${count}`),
          },
          h,
        ),
        ...textFact({ title: "Idioma", maybeText: attributes.language }, h),
        ...textFact(
          { title: "ISBN", maybeText: Option.orElse(attributes.isbn13, () => attributes.isbn10) },
          h,
        ),
        ...linkFact({ title: "Onde encontrar", maybeUrl: attributes.url }, h),
      ],
      FILM: ({ attributes }) => [
        ...textFact({ title: "Direção", maybeText: joined(attributes.directors) }, h),
        ...textFact(
          {
            title: "Lançamento",
            maybeText: Option.map(attributes.releaseDate, formatPartialDate),
          },
          h,
        ),
        ...textFact({ title: "País", maybeText: attributes.country }, h),
        ...textFact({ title: "Idiomas", maybeText: joined(attributes.languages) }, h),
        ...freeChipFact({ title: "Gêneros", maybeValues: attributes.genres }, h),
        ...linkFact(
          {
            title: "Onde assistir",
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
            title: "Formato",
            maybeValues: Option.some([attributes.format]),
            labels: resourceFormatLabels,
          },
          h,
        ),
        ...textFact({ title: "Créditos", maybeText: attributes.creditLine }, h),
        ...linkFact({ title: "Onde acessar", maybeUrl: Option.some(attributes.url) }, h),
      ],
      NOTEWORTHY_ENTITY: ({ attributes }) => [
        ...chipFact(
          {
            id: "entity-type",
            title: "Tipo de organização",
            maybeValues: Option.some([attributes.entityType]),
            labels: entityTypeLabels,
          },
          h,
        ),
        ...textFact(
          {
            title: "Fundação",
            maybeText: Option.map(attributes.foundedDate, formatPartialDate),
          },
          h,
        ),
        ...textFact(
          {
            title: "Encerramento",
            maybeText: Option.map(attributes.dissolvedDate, formatPartialDate),
          },
          h,
        ),
        ...linkFact({ title: "Site", maybeUrl: attributes.url }, h),
      ],
      CONCEPT: () => [],
      UNCATEGORIZED: ({ attributes }) =>
        textFact(
          {
            title: "Tipo sugerido",
            maybeDescription: Option.some("Enquanto ninguém classifica este artigo"),
            maybeText: attributes.suggestedKind,
          },
          h,
        ),
    }),
  )

/** The facts each kind of article is known by, in one card. */
export const view = (page: Page, h: WikiArticleViewBuilder): Html =>
  overviewCard([...namingFacts(page, h), ...kindFacts(page, h)], h)
