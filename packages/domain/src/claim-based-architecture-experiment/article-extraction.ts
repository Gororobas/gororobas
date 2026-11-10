/**
 * What a provider's result says about an article: every property of its kind that lists the
 * provider, extracted and checked (`defineProperty`'s `extractFrom`).
 */
import { Option } from "effect"

import type { ExtractionContext, ExtractionIssue } from "./extraction.js"
import type { ArticleKind } from "./kinds.js"
import { properties } from "./properties/index.js"
import type { PropertyExtraction } from "./property.js"
import type { ProviderInput } from "./providers/index.js"
import { Wikidata } from "./providers/wikidata.js"

export interface ArticleExtraction {
  /** Issues with the result as a whole: a Wikidata item that isn't of the article's kind. */
  readonly issues: ReadonlyArray<ExtractionIssue>
  /** Empty when the result isn't about an article of this kind: nothing is read from it. */
  readonly properties: ReadonlyArray<PropertyExtraction<unknown>>
}

/** Whether the provider's result is about an article of this kind at all. */
const checkSubject = (input: ProviderInput, kind: ArticleKind): Option.Option<ExtractionIssue> =>
  input.provider === "WIKIDATA" ? Wikidata.checkKind(input.result, kind) : Option.none()

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
