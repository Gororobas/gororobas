/**
 * What a provider's result says about an article: every property of its kind that lists the
 * provider, extracted and checked (`defineProperty`'s `extractFrom`).
 */
import { Match, Option } from "effect"

import type { ExtractionContext, ExtractionIssue } from "./extraction.js"
import type { ArticleKind } from "./kinds.js"
import { properties } from "./properties/index.js"
import type { PropertyExtraction } from "./property.js"
import { Gbif } from "./providers/gbif.js"
import type { ProviderInput } from "./providers/index.js"
import { Wikidata } from "./providers/wikidata.js"

export interface ArticleExtraction {
  /** Issues with the result as a whole: a Wikidata item or GBIF taxon not of the article's kind. */
  readonly issues: ReadonlyArray<ExtractionIssue>
  /** Empty when the result isn't about an article of this kind: nothing is read from it. */
  readonly properties: ReadonlyArray<PropertyExtraction<unknown>>
}

/**
 * Whether the provider's result is about an article of this kind at all. Only providers looked up
 * by an identifier that could be any kind of thing need checking: a Wikidata ID people picked,
 * and the GBIF taxon a Wikidata ID leads to. The others only hold their kind's records, looked up
 * by their own IDs.
 * @todo I still haven't understood this
 */
const checkSubject = (input: ProviderInput, kind: ArticleKind): Option.Option<ExtractionIssue> =>
  Match.value(input).pipe(
    Match.discriminatorsExhaustive("provider")({
      WIKIDATA: ({ result }) => Wikidata.checkKind(result, kind),
      GBIF: ({ result }) => Gbif.checkKind(result, kind),
      // Volumes are books.
      GOOGLE_BOOKS: () => Option.none(),
      // Items are resources: scraping creates RESOURCE articles from them.
      CONTENT_CHANNELS: () => Option.none(),
      // Plants for syntropic agroforestry.
      SYNTROPEDIA: () => Option.none(),
      // Movies and series, which are what FILM articles are about.
      TMDB: () => Option.none(),
      // Gazetteer places.
      WHOS_ON_FIRST: () => Option.none(),
    }),
  )

export const extractArticle = ({
  input,
  kind,
  context,
}: {
  readonly input: ProviderInput
  readonly kind: ArticleKind
  readonly context: ExtractionContext
}): ArticleExtraction =>
  Option.match(checkSubject(input, kind), {
    onSome: (issue) => ({ issues: [issue], properties: [] }),
    onNone: () => ({
      issues: [],
      properties: properties
        .filter((property) => property.kinds.some((propertyKind) => propertyKind === kind))
        .flatMap((property) => {
          const extraction: Option.Option<PropertyExtraction<unknown>> = property.extractFrom(
            input,
            context,
          )
          return Option.toArray(extraction)
        }),
    }),
  })
