import { describe, expect, it } from "@effect/vitest"
import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { Handle } from "@gororobas/domain/common/primitives"
import { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import { Array as EffectArray, Match, Option, Schema, String as EffectString } from "effect"
import { fromString } from "foldkit/url"

import {
  ApplicationRoute,
  ProfileEditorSection,
  ProfileTab,
  WikiArticleTab,
  languageRedirectUrl,
  profileEditorUrl,
  profileUrl,
  searchUrl,
  urlToLocatedRoute,
  wikiArticleUrl,
} from "./route"
import {
  SearchQuery,
  SearchScope,
  type WikiKindFilters,
  emptySearchQuery,
  everything,
  wikiScope,
} from "./search-query"

const urlOf = (path: string) => Option.getOrThrow(fromString(`http://localhost${path}`))

const parse = (path: string) => urlToLocatedRoute(urlOf(path))

const located = (language: SupportedLanguage, route: ApplicationRoute) => ({
  maybeLanguage: Option.some(language),
  route,
})

/** Each filter value once, as a comma-separated parameter keeps it. */
const dedupedFilters = (filters: WikiKindFilters): WikiKindFilters =>
  Match.value(filters).pipe(
    Match.withReturnType<WikiKindFilters>(),
    Match.discriminators("kind")({
      PLANT: (plant) => ({
        ...plant,
        plantUsages: EffectArray.dedupe(plant.plantUsages ?? []),
        edibleParts: EffectArray.dedupe(plant.edibleParts ?? []),
        plantLifecycles: EffectArray.dedupe(plant.plantLifecycles ?? []),
        strata: EffectArray.dedupe(plant.strata ?? []),
        plantingMethods: EffectArray.dedupe(plant.plantingMethods ?? []),
      }),
      ANIMAL: (animal) => ({
        ...animal,
        animalRoles: EffectArray.dedupe(animal.animalRoles ?? []),
      }),
      TOOL: (tool) => ({ ...tool, toolUsages: EffectArray.dedupe(tool.toolUsages ?? []) }),
      RESOURCE: (resource) => ({
        ...resource,
        resourceFormats: EffectArray.dedupe(resource.resourceFormats ?? []),
      }),
      NOTEWORTHY_ENTITY: (entity) => ({
        ...entity,
        entityTypes: EffectArray.dedupe(entity.entityTypes ?? []),
      }),
    }),
    Match.orElse((unfiltered) => unfiltered),
  )

/** What survives the URL: text that isn't blank, as typed, and each filter value once. */
const normalized = (query: SearchQuery): SearchQuery => ({
  text: Option.filter(query.text, (text) => EffectString.isNonEmpty(EffectString.trim(text))),
  scope: SearchScope.guards.Wiki(query.scope)
    ? wikiScopeWith(Option.map(query.scope.maybeKind, dedupedFilters))
    : query.scope,
})

const wikiScopeWith = (maybeKind: Option.Option<WikiKindFilters>) =>
  SearchScope.cases.Wiki.make({ maybeKind })

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
        located(language, ApplicationRoute.Search({ query: normalized(query) })),
      )
    },
  )

  it("reads unknown filter values as absent instead of failing the page", () => {
    expect(parse("/pt/buscar?secao=enciclopedia&tipo=planetas&usos=medicinal").route).toEqual(
      ApplicationRoute.Search({ query: { ...emptySearchQuery, scope: wikiScope() } }),
    )

    expect(
      parse("/en/search?section=encyclopedia&kind=plants&uses=medicinal,levitation").route,
    ).toEqual(
      ApplicationRoute.Search({
        query: {
          ...emptySearchQuery,
          scope: wikiScopeWith(
            Option.some({
              kind: "PLANT",
              plantUsages: ["MEDICINAL"],
              edibleParts: [],
              plantLifecycles: [],
              strata: [],
              plantingMethods: [],
            }),
          ),
        },
      }),
    )
  })

  it("ignores filters the chosen type and kind don't offer", () => {
    expect(parse("/en/search?planting=seed&profile=person").route).toEqual(
      ApplicationRoute.Search({ query: { ...emptySearchQuery, scope: everything } }),
    )

    expect(parse("/en/search?section=encyclopedia&kind=books&planting=seed").route).toEqual(
      ApplicationRoute.Search({
        query: { ...emptySearchQuery, scope: wikiScope(Option.some("BOOK")) },
      }),
    )
  })

  it("names parameters in each language", () => {
    const query = { ...emptySearchQuery, scope: wikiScope(Option.some("PLANT")) }

    expect(searchUrl("pt", query)).toBe("/pt/buscar?secao=enciclopedia&tipo=vegetais")
    expect(searchUrl("es", query)).toBe("/es/buscar?seccion=enciclopedia&tipo=vegetales")
    expect(searchUrl("en", query)).toBe("/en/search?section=encyclopedia&kind=plants")
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

describe("profile editor URLs", () => {
  it.prop(
    "a profile editor section survives its localized URL",
    [SupportedLanguage, ProfileEditorSection],
    ([language, section]) => {
      expect(parse(profileEditorUrl(language, section))).toEqual(
        located(language, ApplicationRoute.ProfileEditor({ section })),
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
