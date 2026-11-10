/**
 * An article's JSON-LD for its page, from its resolved values in the page's language: each
 * property publishes through its `schemaOrg` mapping, and fields several properties publish
 * (`sameAs` for every identifier) are gathered in order.
 */
import { Array as EffectArray, Option, Record } from "effect"

import type { WikiArticleId } from "../common/ids.js"
import type { ArticleKind } from "./kinds.js"
import { type PropertyId, properties } from "./properties/index.js"
import { type JsonLdContext, type JsonLdValue, schemaOrgTypeByKind } from "./schema-org.js"

export const articleToJsonLd = ({
  kind,
  articleId,
  propertyValues,
  context,
}: {
  readonly kind: ArticleKind
  readonly articleId: WikiArticleId
  readonly propertyValues: ReadonlyArray<{
    readonly propertyId: PropertyId
    readonly values: ReadonlyArray<unknown>
  }>
  readonly context: JsonLdContext
}) => {
  const fields = propertyValues.flatMap(({ propertyId, values }) =>
    EffectArray.findFirst(properties, (property) => property.id === propertyId).pipe(
      Option.match({
        onNone: () => [],
        onSome: (property) => property.toJsonLd(values, context),
      }),
    ),
  )

  const entries = fields.flatMap((field) => Record.toEntries(field))
  const names = EffectArray.dedupe(entries.map(([name]) => name))
  const valuesOf = (name: string): ReadonlyArray<JsonLdValue> =>
    entries.filter(([entryName]) => entryName === name).map(([, value]) => value)

  return {
    "@context": "https://schema.org",
    "@type": schemaOrgTypeByKind[kind],
    "@id": context.articleUrl(articleId),
    url: context.articleUrl(articleId),
    ...Record.fromEntries(
      names.map((name) => {
        const values = valuesOf(name)
        return [name, values.length === 1 ? (values[0] ?? []) : values]
      }),
    ),
  }
}
