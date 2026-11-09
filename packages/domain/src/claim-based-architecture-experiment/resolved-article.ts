import type { Option } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"

import type { SupportedLanguage } from "../common/enums.js"
import type { WikiArticleId } from "../common/ids.js"
import type { ArticleKind } from "./kinds.js"
import type { Property } from "./properties/index.js"
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
type IsGuaranteed<P extends Property> = P extends {
  readonly presence: "REQUIRED"
  readonly scope: "UNIVERSAL"
}
  ? true
  : false

type ByCardinality<P extends Property> = P extends { readonly cardinality: "ONE" }
  ? IsGuaranteed<P> extends true
    ? ResolvedValue<ValueOf<P>>
    : Option.Option<ResolvedValue<ValueOf<P>>>
  : IsGuaranteed<P> extends true
    ? NonEmptyReadonlyArray<ResolvedValue<ValueOf<P>>>
    : ReadonlyArray<ResolvedValue<ValueOf<P>>>

/** Language-specific properties resolve per language. */
type ResolvedShape<P extends Property> = P["scope"] extends "UNIVERSAL"
  ? ByCardinality<P>
  : { readonly [L in SupportedLanguage]?: ByCardinality<P> }

/**
 * What every reader of an article gets: the API's page payload, search projections, the web app.
 * One shape for every source; where a value came from is in its attestations.
 */
export type ResolvedArticle<Kind extends ArticleKind> = {
  readonly id: WikiArticleId
  readonly kind: Kind
} & { readonly [P in PropertiesOf<Kind> as P["id"]]: ResolvedShape<P> }
