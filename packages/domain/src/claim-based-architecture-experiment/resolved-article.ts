import type { Option } from "effect"

import type { SupportedLanguage } from "../common/enums.js"
import type { WikiArticleId } from "../common/ids.js"
import type { ArticleKind } from "./kinds.js"
import type { Property } from "./properties/index.js"
import type { ResolvedValue } from "./resolution.js"

type PropertiesOf<Kind extends ArticleKind> = Property extends infer P
  ? P extends { readonly subjectKinds: ReadonlyArray<infer K> }
    ? Kind extends K
      ? P
      : never
    : never
  : never

type ValueOf<P extends Property> = P["value"]["Type"]

/** Required `ARTICLE` properties always have a value on a published article. */
type ByCardinality<P extends Property> = P extends { readonly cardinality: "ONE" }
  ? P extends { readonly presence: "REQUIRED"; readonly scope: "ARTICLE_WIDE" }
    ? ResolvedValue<ValueOf<P>>
    : Option.Option<ResolvedValue<ValueOf<P>>>
  : ReadonlyArray<ResolvedValue<ValueOf<P>>>

/** Language-specific properties resolve per language. */
type ResolvedShape<P extends Property> = P["scope"] extends "ARTICLE_WIDE"
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
