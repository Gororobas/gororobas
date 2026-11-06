import { describe, expect, it } from "@effect/vitest"
import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { Handle } from "@gororobas/domain/common/primitives"
import { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import { Array as EffectArray, Option, Schema, String as EffectString } from "effect"
import { fromString } from "foldkit/url"

import {
  ApplicationRoute,
  ProfileTab,
  SearchQuery,
  WikiArticleTab,
  emptySearchQuery,
  languageRedirectUrl,
  profileUrl,
  searchUrl,
  urlToLocatedRoute,
  wikiArticleUrl,
} from "./route"

const urlOf = (path: string) => Option.getOrThrow(fromString(`http://localhost${path}`))

const parse = (path: string) => urlToLocatedRoute(urlOf(path))

const located = (language: SupportedLanguage, route: ApplicationRoute) => ({
  maybeLanguage: Option.some(language),
  route,
})

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
  it.prop(
    "a search query survives its URL in every language",
    [SupportedLanguage, TypedSearchQuery],
    ([language, query]) => {
      expect(parse(searchUrl(language, query))).toEqual(
        located(language, ApplicationRoute.Search(normalized(query))),
      )
    },
  )

  it("reads unknown filter values as absent instead of failing the page", () => {
    expect(parse("/pt/buscar?t=recipes&tipo=planetas&usos=medicinal,levitation").route).toEqual(
      ApplicationRoute.Search({ ...emptySearchQuery, plantUsages: ["MEDICINAL"] }),
    )
  })
})

describe("wiki article URLs", () => {
  it.prop(
    "an article tab survives its localized URL",
    [SupportedLanguage, WikiArticleKind, Handle, WikiArticleTab],
    ([language, kind, handle, tab]) => {
      expect(parse(wikiArticleUrl(language, { kind, handle, tab }))).toEqual(
        located(language, ApplicationRoute.WikiArticle({ kind, handle, tab })),
      )
    },
  )
})

describe("profile URLs", () => {
  it.prop(
    "a profile tab survives its localized URL",
    [SupportedLanguage, Handle, ProfileTab],
    ([language, handle, tab]) => {
      expect(parse(profileUrl(language, { handle: handle, tab }))).toEqual(
        located(language, ApplicationRoute.Profile({ handle, tab })),
      )
    },
  )
})

describe("paths without a language", () => {
  it.prop(
    "redirect to the same page in the detected language",
    [SupportedLanguage, WikiArticleKind, Handle, WikiArticleTab],
    ([language, kind, handle, tab]) => {
      const legacy = urlOf(wikiArticleUrl("pt", { kind, handle, tab }).slice("/pt".length))

      expect(languageRedirectUrl(language, legacy)).toBe(
        wikiArticleUrl(language, { kind, handle, tab }),
      )
    },
  )

  it("keep unknown paths, so the language's not-found page names them", () => {
    expect(languageRedirectUrl("en", urlOf("/nada/aqui?x=1"))).toBe("/en/nada/aqui?x=1")
  })
})
