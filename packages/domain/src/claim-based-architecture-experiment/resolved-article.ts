import type { Option } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"

import type { SupportedLanguage } from "../common/enums.js"
import type { WikiArticleId } from "../common/ids.js"
import type { WithChosenInheritance, WithInherited } from "./inheritance.js"
import type { ArticleKind } from "./kinds.js"
import type { CanonicalProperty, Property, SituatedProperty } from "./properties/index.js"
import type { ResolvedValue } from "./resolution.js"

type PropertiesOf<Kind extends ArticleKind> = Property extends infer P
  ? P extends { readonly kinds: ReadonlyArray<infer K> }
    ? Kind extends K
      ? P
      : never
    : never
  : never

type ValueOf<P extends Property> = P["valueSchema"]["Type"]

/**
 * Required universal properties always have a value on a published article (`keepsRequiredValue`
 * guards it). Required language-specific ones have one in some language, not necessarily the
 * reader's: readers missing theirs see another language's, with a notice.
 */
type IsGuaranteed<P extends CanonicalProperty> = P extends {
  readonly presence: "REQUIRED"
  readonly scope: "UNIVERSAL"
}
  ? true
  : false

type ByCardinality<P extends CanonicalProperty> = P extends { readonly cardinality: "ONE" }
  ? IsGuaranteed<P> extends true
    ? ResolvedValue<ValueOf<P>>
    : Option.Option<ResolvedValue<ValueOf<P>>>
  : IsGuaranteed<P> extends true
    ? NonEmptyReadonlyArray<ResolvedValue<ValueOf<P>>>
    : ReadonlyArray<ResolvedValue<ValueOf<P>>>

/** A situated property's summary, as its `summary` strategy tallies it. */
type SummaryOf<P extends SituatedProperty> = ReturnType<P["summary"]["tally"]>

/** A canonical property resolves to its values; a situated one to its summary. */
type Own<P extends Property> = P extends CanonicalProperty
  ? ByCardinality<P>
  : P extends SituatedProperty
    ? SummaryOf<P>
    : never

/** With the ancestors' values, for properties that inherit: the property decides, not the kind. */
type ByInheritance<P extends Property> = [Exclude<P["inheritance"], undefined>] extends [never]
  ? Own<P>
  : Exclude<P["inheritance"], undefined> extends { readonly mode: "BY_CHOICE" }
    ? WithChosenInheritance<Own<P>>
    : WithInherited<Own<P>>

/** Language-specific properties resolve per language. */
type ResolvedShape<P extends Property> = P["scope"] extends "UNIVERSAL"
  ? ByInheritance<P>
  : { readonly [L in SupportedLanguage]?: ByInheritance<P> }

/**
 * What every reader of an article gets: the API's page payload, search projections, the web app.
 * One shape for every source; where a value came from is in its attestations or its summary.
 */
export type ResolvedArticle<Kind extends ArticleKind> = {
  readonly id: WikiArticleId
  readonly kind: Kind
} & { readonly [P in PropertiesOf<Kind> as P["id"]]: ResolvedShape<P> }
