import { describe, expect, it } from "@effect/vitest"
import { Handle } from "@gororobas/domain/common/primitives"
import { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import { Array as EffectArray, Option, Schema, String as EffectString } from "effect"
import { fromString } from "foldkit/url"

import {
  ApplicationRoute,
  SearchQuery,
  WikiArticleTab,
  emptySearchQuery,
  searchUrl,
  urlToApplicationRoute,
  wikiArticleUrl,
} from "./route"

const parse = (path: string) =>
  urlToApplicationRoute(Option.getOrThrow(fromString(`http://localhost${path}`)))

/** What survives the URL: text that isn't blank, as typed, and each list value once. */
const normalized = (query: SearchQuery): SearchQuery => ({
  ...query,
  text: Option.filter(query.text, (text) => EffectString.isNonEmpty(EffectString.trim(text))),
  plantUsages: EffectArray.dedupe(query.plantUsages),
  plantLifecycles: EffectArray.dedupe(query.plantLifecycles),
  plantingMethods: EffectArray.dedupe(query.plantingMethods),
  strata: EffectArray.dedupe(query.strata),
  edibleParts: EffectArray.dedupe(query.edibleParts),
  animalRoles: EffectArray.dedupe(query.animalRoles),
  toolUsages: EffectArray.dedupe(query.toolUsages),
  resourceFormats: EffectArray.dedupe(query.resourceFormats),
  entityTypes: EffectArray.dedupe(query.entityTypes),
})

const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

/** Text a person can type: well-formed Unicode, which URLs can encode. */
const TypedSearchQuery = SearchQuery.mapFields((fields) => ({
  ...fields,
  text: Schema.Option(
    Schema.String.check(
      Schema.makeFilter((text) => !loneSurrogate.test(text), {
        identifier: "WellFormedText",
        title: "Well-formed text",
        description: "Text without lone UTF-16 surrogates, which URLs can't encode.",
      }),
    ),
  ),
}))

describe("search URLs", () => {
  it.prop("a search query survives its URL", [TypedSearchQuery], ([query]) => {
    expect(parse(searchUrl(query))).toEqual(ApplicationRoute.Search(normalized(query)))
  })

  it("reads unknown filter values as absent instead of failing the page", () => {
    expect(parse("/buscar?t=recipes&tipo=planetas&usos=medicinal,levitation")).toEqual(
      ApplicationRoute.Search({ ...emptySearchQuery, plantUsages: ["MEDICINAL"] }),
    )
  })
})

describe("wiki article URLs", () => {
  it.prop(
    "an article tab survives its localized URL",
    [WikiArticleKind, Handle, WikiArticleTab],
    ([kind, handle, tab]) => {
      expect(parse(wikiArticleUrl({ kind, handle }, tab))).toEqual(
        ApplicationRoute.WikiArticle({ kind, handle, tab }),
      )
    },
  )
})
