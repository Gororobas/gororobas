/**
 * Reading GBIF's taxa in a property's `extract`. Its result is already typed by the external data
 * fetch (`GbifResultWithImportedPhotos`), so properties read most fields directly.
 */
import { Option } from "effect"

import type { ExtractionIssue } from "../extraction.js"
import type { ArticleKind } from "../kinds.js"
import type { GbifResultWithImportedPhotos } from "./index.js"

/** The kingdom a taxon must be in to be about an article of each kind. */
const KINGDOM_BY_KIND = {
  PLANT: "Plantae",
  PLANT_CULTIVAR: "Plantae",
  ANIMAL: "Animalia",
  BOOK: null,
  FILM: null,
  NOTEWORTHY_PERSON: null,
  NOTEWORTHY_ENTITY: null,
  CONTENT_PRODUCER: null,
  PLACE: null,
  RESOURCE: null,
  TOOL: null,
  CONCEPT: null,
  UNCATEGORIZED: null,
} as const satisfies { readonly [Kind in ArticleKind]: string | null }

export const Gbif = {
  /**
   * Whether the taxon is about an article of this kind, by its kingdom. GBIF is fetched by
   * Wikidata ID too, so a wrong one could bring an animal's photos and names to a plant.
   */
  checkKind: (
    result: GbifResultWithImportedPhotos,
    kind: ArticleKind,
  ): Option.Option<ExtractionIssue> => {
    const expected: string | null = KINGDOM_BY_KIND[kind]
    if (expected === null) return Option.none()

    const kingdoms = result.classification
      .filter(({ taxonRank }) => taxonRank === "KINGDOM")
      .map(({ scientificName }) => scientificName)

    return kingdoms.includes(expected)
      ? Option.none()
      : Option.some({ _tag: "NOT_OF_KIND", expected: [expected], found: kingdoms })
  },
}
