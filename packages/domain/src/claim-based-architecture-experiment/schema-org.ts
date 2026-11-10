import type { SupportedLanguage } from "../common/enums.js"
/**
 * How properties publish as schema.org, for JSON-LD in article pages (`json-ld.ts`). A property's
 * `schemaOrg` says which schema.org fields its values become and how close the match is.
 */
import type { WikiArticleId, MediaAssetId } from "../common/ids.js"
import type { ArticleKind } from "./kinds.js"

/**
 * SKOS's match strengths: `EXACT` (exactMatch) means the same thing, `CLOSE` (closeMatch) nearly,
 * `BROADER` (broadMatch) that schema.org's is wider than ours. Recorded so the choice is a
 * decision, not a guess.
 */
export type MatchStrength = "EXACT" | "CLOSE" | "BROADER"

export type JsonLdValue =
  | string
  | number
  | boolean
  | { readonly [key: string]: JsonLdValue }
  | ReadonlyArray<JsonLdValue>

export type JsonLdFields = { readonly [property: string]: JsonLdValue }

export interface JsonLdContext {
  readonly language: SupportedLanguage
  /** The linked article's page, with its kind's path and its handle. */
  readonly articleUrl: (wikiArticleId: WikiArticleId) => string
  readonly mediaUrl: (mediaAssetId: MediaAssetId) => string
}

export interface SchemaOrgMapping<Value> {
  readonly match: MatchStrength
  /**
   * One value's fields. `index` is its position among the property's values, for lists that
   * publish their first value apart (`name`, then `alternateName`).
   */
  readonly encode: (
    value: Value,
    options: { readonly context: JsonLdContext; readonly index: number },
  ) => JsonLdFields
}

export const schemaOrgTypeByKind = {
  PLANT: "Taxon",
  PLANT_CULTIVAR: "Taxon",
  ANIMAL: "Taxon",
  BOOK: "Book",
  FILM: "Movie",
  NOTEWORTHY_PERSON: "Person",
  NOTEWORTHY_ENTITY: "Organization",
  CONTENT_PRODUCER: "Organization",
  PLACE: "Place",
  RESOURCE: "CreativeWork",
  TOOL: "Product",
  CONCEPT: "DefinedTerm",
  UNCATEGORIZED: "Thing",
} as const satisfies { readonly [Kind in ArticleKind]: string }
