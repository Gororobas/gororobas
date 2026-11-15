/**
 * Articles inheriting from other articles: a cultivar from its plant, and later an animal breed
 * from its species or a place from the places containing it. A relation property (`cultivarOf`)
 * links an article to the articles it inherits from, and each property says whether and how its
 * values pass down (`inheritance` in its definition), so an article's shape depends on its
 * properties, never on its kind.
 *
 * Inheritance runs when an article is read, so a parent's changes show without copying anything
 * into its children.
 */
import { Schema } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"

import type { WikiArticleId } from "../common/ids.js"

/**
 * The canonical relation properties an article inherits through: a value of one points at an
 * article to inherit from. Each must reference articles (`references`), checked by a test.
 */
export const InheritanceRelation = Schema.Literals(["cultivarOf"])

export type InheritanceRelation = typeof InheritanceRelation.Type

/**
 * - `ALONGSIDE`: readers see the article's own values, and beneath them each ancestor's,
 *   labelled ("da cenoura em geral"). Never merged, so "3 pessoas" on a cultivar always means
 *   three people talking about that cultivar. For situated properties, whose summaries don't
 *   combine.
 * - `BY_CHOICE`: the article's values are its own, or, when it lists the property in
 *   `inheritedProperties`, its ancestors': today's `CultivarProperty` (`Unknown | Inherit |
 *   Value`). Inheriting and having values of its own are different statements, so neither is
 *   assumed: a cultivar's growth form is unknown until someone says it's the plant's, or another.
 *
 * @todo (personal) I need to better understand this
 */
export type InheritanceMode = "ALONGSIDE" | "BY_CHOICE"

export interface InheritanceDefinition {
  readonly through: NonEmptyReadonlyArray<InheritanceRelation>
  readonly mode: InheritanceMode
}

/**
 * The properties an article may choose to inherit: every `BY_CHOICE` property, which a test
 * checks. Spelled out rather than derived, since the registry imports `inheritedProperties`.
 *
 * @todo this shouldn't live in a centralized place, all inheritance-related config should belong at the property level
 */
export const InheritablePropertyId = Schema.Literals([
  "crownShape",
  "growthForm",
  "seedDormancy",
  "seedStorageBehavior",
])

export type InheritablePropertyId = typeof InheritablePropertyId.Type

/** What one ancestor says, resolved as the property resolves for that article. */
export interface AncestorValues<Resolved> {
  readonly articleId: WikiArticleId
  readonly through: InheritanceRelation
  readonly resolved: Resolved
}

/** An `ALONGSIDE` property as its page shows it. */
export interface WithInherited<Resolved> {
  readonly own: Resolved
  /** Nearest first: a cultivar's plant, a municipality's state before its country. */
  readonly inherited: ReadonlyArray<AncestorValues<Resolved>>
}

/**
 * A `BY_CHOICE` property as its page shows it. The ancestors' values come along either way, so the
 * page can show them beside the article's own, or for context when the article's are unknown.
 */
export interface WithChosenInheritance<Resolved> extends WithInherited<Resolved> {
  /**
   * The article lists the property in `inheritedProperties`: the ancestors' values are its values.
   * Should it also have values of its own, inheriting wins, since it's the explicit choice; the
   * edit form offers one or the other, and choosing to inherit retracts the article's own claims.
   */
  readonly isInheriting: boolean
}

export const withChosenInheritance = <Resolved>({
  propertyId,
  own,
  inherited,
  inheritedProperties,
}: {
  readonly propertyId: InheritablePropertyId
  readonly own: Resolved
  readonly inherited: ReadonlyArray<AncestorValues<Resolved>>
  /** The article's resolved `inheritedProperties`. */
  readonly inheritedProperties: ReadonlyArray<InheritablePropertyId>
}): WithChosenInheritance<Resolved> => ({
  own,
  inherited,
  isInheriting: inheritedProperties.includes(propertyId),
})
