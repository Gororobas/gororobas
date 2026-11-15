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

  const fieldEntries = fields.flatMap((field) => Record.toEntries(field))
  // The article's own name (`mostCommonlyKnownAs`) is usually one of its situated names too;
  // JSON-LD leaves out alternate names that repeat it.
  const articleNames = fieldEntries.flatMap(([key, value]) => (key === "name" ? [value] : []))
  const publishedEntries = fieldEntries.filter(
    ([key, value]) => key !== "alternateName" || !articleNames.includes(value),
  )
  const publishedKeys = EffectArray.dedupe(publishedEntries.map(([key]) => key))
  const valuesFor = (key: string): ReadonlyArray<JsonLdValue> =>
    publishedEntries.filter(([entryKey]) => entryKey === key).map(([, value]) => value)

  return {
    "@context": "https://schema.org",
    "@type": schemaOrgTypeByKind[kind],
    "@id": context.articleUrl(articleId),
    url: context.articleUrl(articleId),
    ...Record.fromEntries(
      publishedKeys.map((key) => {
        const values = valuesFor(key)
        return [key, values.length === 1 ? (values[0] ?? []) : values]
      }),
    ),
  }
}
