import { Schema } from "effect"

/**
 * Kinds are only names: properties declare which kinds they apply to, so nothing about a kind's
 * shape lives here and this module imports nothing. Today `WikiArticleKind` is derived from the
 * kinds' schemas, which is what creates the import loops.
 */
export const ArticleKind = Schema.Literals([
  "ANIMAL",
  "BOOK",
  "CONCEPT",
  "CONTENT_PRODUCER",
  "FILM",
  "NOTEWORTHY_ENTITY",
  "NOTEWORTHY_PERSON",
  "PLACE",
  "PLANT",
  "PLANT_CULTIVAR",
  "RESOURCE",
  "TOOL",
  "UNCATEGORIZED",
])

export type ArticleKind = typeof ArticleKind.Type

export const everyKind = ArticleKind.literals

/** Plant properties a cultivar may inherit from its plant (see `inheritsFromParent`). */
export const InheritableTrait = Schema.Literals([
  "scientificNames",
  "height",
  "temperature",
  "developmentCycle",
  "edibleParts",
  "lifecycles",
  "plantingMethods",
  "strata",
  "plantUsage",
])

export type InheritableTrait = typeof InheritableTrait.Type
