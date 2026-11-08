import {
  AgroforestryStratum,
  AnimalRole,
  EdiblePlantPart,
  NoteworthyEntityType,
  PlantLifecycle,
  PlantUsage,
  PlantingMethod,
  ProfileType,
  PublicationKind,
  ResourceFormat,
  SupportedLanguage,
  ToolUsage,
} from "@gororobas/domain/common/enums"
import { WikiArticleId } from "@gororobas/domain/common/ids"
import { Handle } from "@gororobas/domain/common/primitives"
import {
  ExternalDataOutcomeTag,
  ExternalDataProvider,
  WikiArticleKind,
} from "@gororobas/domain/wiki/domain"
import {
  Array as EffectArray,
  Effect,
  Match,
  Option,
  Record,
  Schema,
  SchemaIssue,
  SchemaTransformation,
  String as EffectString,
  pipe,
} from "effect"
import { Route } from "foldkit"
import { defineRouteUnion, literal, schemaSegment, slash } from "foldkit/route"
import type { Url } from "foldkit/url"

import {
  SearchQuery,
  SearchScope,
  SearchType,
  type WikiKindFilters,
  emptySearchQuery,
  everything,
  peopleScope,
  publicationsScope,
  scopeType,
  unfilteredKind,
} from "./search-query"

// PATH SEGMENTS

export const WikiArticleTab = Schema.Literals(["About", "Publications", "Photos", "Contributions"])
export type WikiArticleTab = typeof WikiArticleTab.Type

export const ProfileTab = Schema.Literals([
  "Home",
  "Publications",
  "Photos",
  "Contributions",
  "Bookmarks",
])

export type ProfileTab = typeof ProfileTab.Type

/** The signed-in person's account, one section per child of the profile editor. */
export const ProfileEditorSection = Schema.Literals(["About", "Places", "Settings"])
export type ProfileEditorSection = typeof ProfileEditorSection.Type

/** A language's fixed path segments. Handles are content and stay the same in every language. */
type PathSlugs = Readonly<{
  wikiKinds: Readonly<Record<WikiArticleKind, string>>
  wikiArticleTabs: Readonly<Record<WikiArticleTab, string>>
  profileTabs: Readonly<Record<ProfileTab, string>>
  profile: string
  search: string
  profileEditor: string
  profileEditorSections: Readonly<Record<ProfileEditorSection, string>>
  externalDataAdminDashboard: string
  searchTypes: Readonly<Record<SearchType, string>>
  searchKeys: SearchKeys
  observationLogKeys: Readonly<Record<keyof ObservationLogQuery, string>>
}>

type SearchKeys = Readonly<Record<keyof SearchParameters, string>>

const pathSlugs: Readonly<Record<SupportedLanguage, PathSlugs>> = {
  pt: {
    wikiKinds: {
      PLANT: "vegetais",
      PLANT_CULTIVAR: "variedades",
      ANIMAL: "animais",
      BOOK: "livros",
      FILM: "filmes",
      CONCEPT: "conceitos",
      PLACE: "lugares",
      TOOL: "ferramentas",
      RESOURCE: "recursos",
      NOTEWORTHY_ENTITY: "organizacoes",
      UNCATEGORIZED: "outros",
    },
    wikiArticleTabs: {
      About: "sobre",
      Publications: "publicacoes",
      Photos: "fotos",
      Contributions: "contribuicoes",
    },
    profileTabs: {
      Home: "inicio",
      Publications: "publicacoes",
      Photos: "fotos",
      Contributions: "contribuicoes",
      Bookmarks: "salvos",
    },
    profile: "gente",
    search: "buscar",
    profileEditor: "minha-conta",
    profileEditorSections: { About: "sobre-mim", Places: "lugares", Settings: "configuracoes" },
    externalDataAdminDashboard: "dados-externos",
    searchTypes: { wiki: "enciclopedia", publications: "publicacoes", people: "gente" },
    searchKeys: {
      text: "q",
      type: "secao",
      wikiKind: "tipo",
      plantUsages: "usos",
      plantLifecycles: "ciclos",
      plantingMethods: "plantio",
      strata: "estratos",
      edibleParts: "partes",
      animalRoles: "papeis",
      toolUsages: "aplicacoes",
      resourceFormats: "formatos",
      entityTypes: "categorias",
      publicationKind: "formato",
      profileType: "perfil",
    },
    observationLogKeys: {
      provider: "provedor",
      outcome: "resultado",
      wikiArticleId: "artigo",
      currentPage: "pagina",
    },
  },
  es: {
    wikiKinds: {
      PLANT: "vegetales",
      PLANT_CULTIVAR: "variedades",
      ANIMAL: "animales",
      BOOK: "libros",
      FILM: "peliculas",
      CONCEPT: "conceptos",
      PLACE: "lugares",
      TOOL: "herramientas",
      RESOURCE: "recursos",
      NOTEWORTHY_ENTITY: "organizaciones",
      UNCATEGORIZED: "otros",
    },
    wikiArticleTabs: {
      About: "sobre",
      Publications: "publicaciones",
      Photos: "fotos",
      Contributions: "contribuciones",
    },
    profileTabs: {
      Home: "inicio",
      Publications: "publicaciones",
      Photos: "fotos",
      Contributions: "contribuciones",
      Bookmarks: "guardados",
    },
    profile: "gente",
    search: "buscar",
    profileEditor: "mi-cuenta",
    profileEditorSections: { About: "sobre-mi", Places: "lugares", Settings: "ajustes" },
    externalDataAdminDashboard: "datos-externos",
    searchTypes: { wiki: "enciclopedia", publications: "publicaciones", people: "gente" },
    searchKeys: {
      text: "q",
      type: "seccion",
      wikiKind: "tipo",
      plantUsages: "usos",
      plantLifecycles: "ciclos",
      plantingMethods: "siembra",
      strata: "estratos",
      edibleParts: "partes",
      animalRoles: "roles",
      toolUsages: "aplicaciones",
      resourceFormats: "formatos",
      entityTypes: "categorias",
      publicationKind: "formato",
      profileType: "perfil",
    },
    observationLogKeys: {
      provider: "proveedor",
      outcome: "resultado",
      wikiArticleId: "articulo",
      currentPage: "pagina",
    },
  },
  en: {
    wikiKinds: {
      PLANT: "plants",
      PLANT_CULTIVAR: "varieties",
      ANIMAL: "animals",
      BOOK: "books",
      FILM: "films",
      CONCEPT: "concepts",
      PLACE: "places",
      TOOL: "tools",
      RESOURCE: "resources",
      NOTEWORTHY_ENTITY: "organizations",
      UNCATEGORIZED: "other",
    },
    wikiArticleTabs: {
      About: "about",
      Publications: "publications",
      Photos: "photos",
      Contributions: "contributions",
    },
    profileTabs: {
      Home: "home",
      Publications: "publications",
      Photos: "photos",
      Contributions: "contributions",
      Bookmarks: "bookmarks",
    },
    profile: "people",
    search: "search",
    profileEditor: "account",
    profileEditorSections: { About: "about-me", Places: "places", Settings: "settings" },
    externalDataAdminDashboard: "external-data",
    searchTypes: { wiki: "encyclopedia", publications: "posts", people: "people" },
    searchKeys: {
      text: "q",
      type: "section",
      wikiKind: "kind",
      plantUsages: "uses",
      plantLifecycles: "lifecycles",
      plantingMethods: "planting",
      strata: "strata",
      edibleParts: "parts",
      animalRoles: "roles",
      toolUsages: "applications",
      resourceFormats: "formats",
      entityTypes: "categories",
      publicationKind: "format",
      profileType: "profile",
    },
    observationLogKeys: {
      provider: "provider",
      outcome: "outcome",
      wikiArticleId: "article",
      currentPage: "page",
    },
  },
}

/** Decodes one segment through a total lookup table, so every value has exactly one slug. */
const slugCodec = <const Value extends string, const Slug extends string>(
  slugs: Readonly<Record<Value, Slug>>,
  ValueSchema: Schema.Codec<Value>,
) => {
  const bySlug: Record<string, Value> = Record.fromEntries(
    Record.toEntries(slugs).map(([value, slug]) => [slug, value]),
  )

  return Schema.String.pipe(
    Schema.decodeTo(
      ValueSchema,
      SchemaTransformation.transformEffect({
        decode: (slug) =>
          Effect.fromOption(
            Record.get(bySlug, slug),
            () => new SchemaIssue.InvalidValue({ message: `Unknown slug ${slug}` }, slug),
          ),
        encode: (value) => Effect.succeed<string>(slugs[value]),
      }),
    ),
  )
}

// SEARCH QUERY

/**
 * A search as flat URL parameters. Decoding keeps only the ones the chosen type and kind offer, so
 * `?plantio=` outside a plant search reads as absent.
 */
type SearchParameters = Readonly<{
  text: Option.Option<string>
  type: Option.Option<SearchType>
  wikiKind: Option.Option<WikiArticleKind>
  plantUsages: ReadonlyArray<PlantUsage>
  plantLifecycles: ReadonlyArray<PlantLifecycle>
  plantingMethods: ReadonlyArray<PlantingMethod>
  strata: ReadonlyArray<AgroforestryStratum>
  edibleParts: ReadonlyArray<EdiblePlantPart>
  animalRoles: ReadonlyArray<AnimalRole>
  toolUsages: ReadonlyArray<ToolUsage>
  resourceFormats: ReadonlyArray<typeof ResourceFormat.Type>
  entityTypes: ReadonlyArray<typeof NoteworthyEntityType.Type>
  publicationKind: Option.Option<PublicationKind>
  profileType: Option.Option<ProfileType>
}>

const noSearchParameters: SearchParameters = {
  text: Option.none(),
  type: Option.none(),
  wikiKind: Option.none(),
  plantUsages: [],
  plantLifecycles: [],
  plantingMethods: [],
  strata: [],
  edibleParts: [],
  animalRoles: [],
  toolUsages: [],
  resourceFormats: [],
  entityTypes: [],
  publicationKind: Option.none(),
  profileType: Option.none(),
}

const kindFiltersFromParameters = (
  kind: WikiArticleKind,
  parameters: SearchParameters,
): WikiKindFilters =>
  Match.value(kind).pipe(
    Match.withReturnType<WikiKindFilters>(),
    Match.when("PLANT", (plant) => ({
      kind: plant,
      plantUsages: parameters.plantUsages,
      edibleParts: parameters.edibleParts,
      plantLifecycles: parameters.plantLifecycles,
      strata: parameters.strata,
      plantingMethods: parameters.plantingMethods,
    })),
    Match.when("ANIMAL", (animal) => ({ kind: animal, animalRoles: parameters.animalRoles })),
    Match.when("TOOL", (tool) => ({ kind: tool, toolUsages: parameters.toolUsages })),
    Match.when("RESOURCE", (resource) => ({
      kind: resource,
      resourceFormats: parameters.resourceFormats,
    })),
    Match.when("NOTEWORTHY_ENTITY", (entity) => ({
      kind: entity,
      entityTypes: parameters.entityTypes,
    })),
    Match.orElse(unfilteredKind),
  )

const searchQueryFromParameters = (parameters: SearchParameters): SearchQuery => ({
  text: parameters.text,
  scope: Option.match(parameters.type, {
    onNone: () => everything,
    onSome: (type) =>
      Match.value(type).pipe(
        Match.withReturnType<SearchScope>(),
        Match.when("wiki", () =>
          SearchScope.cases.Wiki.make({
            maybeKind: Option.map(parameters.wikiKind, (kind) =>
              kindFiltersFromParameters(kind, parameters),
            ),
          }),
        ),
        Match.when("publications", () => publicationsScope(parameters.publicationKind)),
        Match.when("people", () => peopleScope(parameters.profileType)),
        Match.exhaustive,
      ),
  }),
})

const searchQueryToParameters = ({ text, scope }: SearchQuery): SearchParameters => ({
  ...noSearchParameters,
  text,
  type: scopeType(scope),
  ...SearchScope.match(scope, {
    Everything: () => ({}),
    Wiki: ({ maybeKind }) =>
      Option.match(maybeKind, {
        onNone: () => ({}),
        onSome: ({ kind, ...filters }) => ({ wikiKind: Option.some(kind), ...filters }),
      }),
    Publications: ({ maybeKind }) => ({ publicationKind: maybeKind }),
    People: ({ maybeType }) => ({ profileType: maybeType }),
  }),
})

const toParamValue = (value: string) => EffectString.toLowerCase(value).replaceAll("_", "-")
const fromParamValue = (value: string) => EffectString.toUpperCase(value).replaceAll("-", "_")

/** A single-valued parameter. Unknown values read as absent rather than failing the route. */
const optionalParam = <A extends string>(schema: Schema.Codec<A>, format: "raw" | "enum") => {
  // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- URL parameters are free text until a known value decodes from them.
  const decode = Schema.decodeUnknownOption(schema)
  const toUrl = format === "enum" ? toParamValue : (value: string) => value
  const fromUrl = format === "enum" ? fromParamValue : (value: string) => value

  return Schema.OptionFromOptional(Schema.String).pipe(
    Schema.decodeTo(
      Schema.Option(schema),
      SchemaTransformation.transform({
        // Free text keeps its spaces: the search field renders from the URL, so trimming here
        // would swallow the space someone just typed between two words.
        decode: (maybeRaw) =>
          pipe(
            maybeRaw,
            Option.map((raw) => (format === "enum" ? EffectString.trim(raw) : raw)),
            Option.filter((raw) => EffectString.isNonEmpty(EffectString.trim(raw))),
            Option.flatMap((raw) => decode(fromUrl(raw))),
          ),
        encode: Option.map(toUrl),
      }),
    ),
  )
}

/** Comma-separated enum values. Unknown entries are dropped. */
const listParam = <A extends string>(schema: Schema.Codec<A>) => {
  // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- URL parameters are free text until a known value decodes from them.
  const decode = Schema.decodeUnknownOption(schema)

  return Schema.OptionFromOptional(Schema.String).pipe(
    Schema.decodeTo(
      Schema.Array(schema),
      SchemaTransformation.transform<ReadonlyArray<A>, Option.Option<string>>({
        decode: (maybeRaw) =>
          pipe(
            Option.getOrElse(maybeRaw, () => ""),
            EffectString.split(","),
            EffectArray.map((raw) => decode(fromParamValue(EffectString.trim(raw)))),
            EffectArray.getSomes,
            EffectArray.dedupe,
          ),
        encode: (values) =>
          EffectArray.match(values, {
            onEmpty: () => Option.none(),
            onNonEmpty: (nonEmpty) => Option.some(nonEmpty.map(toParamValue).join(",")),
          }),
      }),
    ),
  )
}

/** A single value through a language's slugs, such as `?tipo=livros`. */
const optionalSlugParam = <const Value extends string>(
  slugs: Readonly<Record<Value, string>>,
  ValueSchema: Schema.Codec<Value>,
) => {
  const ValueFromSlug = slugCodec(slugs, ValueSchema)

  return Schema.OptionFromOptional(Schema.String).pipe(
    Schema.decodeTo(
      Schema.Option(ValueSchema),
      SchemaTransformation.transform<Option.Option<Value>, Option.Option<string>>({
        // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- URL parameters are free text until a known value decodes from them.
        decode: Option.flatMap(Schema.decodeUnknownOption(ValueFromSlug)),
        encode: Option.map((value) => slugs[value]),
      }),
    ),
  )
}

const flatSearchParameters = (slugs: PathSlugs) =>
  Schema.Struct({
    text: optionalParam(Schema.String, "raw"),
    type: optionalSlugParam(slugs.searchTypes, SearchType),
    wikiKind: optionalSlugParam(slugs.wikiKinds, WikiArticleKind),
    plantUsages: listParam(PlantUsage),
    plantLifecycles: listParam(PlantLifecycle),
    plantingMethods: listParam(PlantingMethod),
    strata: listParam(AgroforestryStratum),
    edibleParts: listParam(EdiblePlantPart),
    animalRoles: listParam(AnimalRole),
    toolUsages: listParam(ToolUsage),
    resourceFormats: listParam(ResourceFormat),
    entityTypes: listParam(NoteworthyEntityType),
    publicationKind: optionalParam(PublicationKind, "enum"),
    profileType: optionalParam(ProfileType, "enum"),
  }).pipe(Schema.encodeKeys(slugs.searchKeys))

/** A language's search as URL parameters, with its own keys and type slugs. */
const searchQueryParameters = (slugs: PathSlugs) =>
  flatSearchParameters(slugs).pipe(
    Schema.decodeTo(
      Schema.Struct({ query: SearchQuery }),
      SchemaTransformation.transform({
        decode: (parameters) => ({ query: searchQueryFromParameters(parameters) }),
        encode: ({ query }) => searchQueryToParameters(query),
      }),
    ),
  )

// EXTERNAL DATA OBSERVATIONS QUERY

/** Pages count from 1 in the URL; anything else reads as the first page. */
const pageParam = Schema.OptionFromOptional(Schema.String).pipe(
  Schema.decodeTo(
    Schema.Int,
    SchemaTransformation.transform<number, Option.Option<string>>({
      decode: (maybeRaw) =>
        pipe(
          maybeRaw,
          Option.map((raw) => Number(EffectString.trim(raw))),
          Option.filter((page) => Number.isInteger(page) && page >= 1),
          Option.match({ onNone: () => 0, onSome: (page) => page - 1 }),
        ),
      encode: (currentPage) =>
        currentPage === 0 ? Option.none() : Option.some(String(currentPage + 1)),
    }),
  ),
)

const wikiArticleIdParam = Schema.OptionFromOptional(Schema.String).pipe(
  Schema.decodeTo(
    Schema.Option(WikiArticleId),
    // An ID that doesn't decode reads as absent rather than failing the route.
    SchemaTransformation.transform<Option.Option<string>, Option.Option<string>>({
      decode: Option.filter(Schema.is(WikiArticleId)),
      encode: (id) => id,
    }),
  ),
)

/** Which observations the log shows, all of it in the URL so a view can be shared. */
export const ObservationLogQuery = Schema.Struct({
  provider: Schema.Option(ExternalDataProvider),
  outcome: Schema.Option(ExternalDataOutcomeTag),
  wikiArticleId: Schema.Option(WikiArticleId),
  currentPage: Schema.Int,
})

export type ObservationLogQuery = typeof ObservationLogQuery.Type

const observationLogQueryParameters = (slugs: PathSlugs) =>
  Schema.Struct({
    provider: optionalParam(ExternalDataProvider, "enum"),
    outcome: optionalParam(ExternalDataOutcomeTag, "raw"),
    wikiArticleId: wikiArticleIdParam,
    currentPage: pageParam,
  }).pipe(Schema.encodeKeys(slugs.observationLogKeys))

export const emptyObservationLogQuery: ObservationLogQuery = {
  provider: Option.none(),
  outcome: Option.none(),
  wikiArticleId: Option.none(),
  currentPage: 0,
}

// ROUTES

export const ApplicationRoute = defineRouteUnion({
  Search: { query: SearchQuery },
  WikiArticle: { kind: WikiArticleKind, handle: Handle, tab: WikiArticleTab },
  WikiArticleDebug: { wikiArticleId: WikiArticleId },
  Profile: { handle: Handle, tab: ProfileTab },
  Login: {},
  ProfileEditor: { section: ProfileEditorSection },
  ExternalDataAdminDashboard: ObservationLogQuery.fields,
  NotFound: { path: Schema.String },
})

export type ApplicationRoute = typeof ApplicationRoute.Type

/** One language's routers, for paths with that language's prefix already removed. */
const makeRouters = (slugs: PathSlugs) => {
  const SearchQueryParameters = searchQueryParameters(slugs)
  const WikiArticleKindFromSlug = slugCodec(slugs.wikiKinds, WikiArticleKind)
  const WikiArticleTabFromSlug = slugCodec(slugs.wikiArticleTabs, WikiArticleTab)
  const ProfileTabFromSlug = slugCodec(slugs.profileTabs, ProfileTab)

  const home = pipe(
    Route.root,
    Route.query(SearchQueryParameters),
    Route.mapTo(ApplicationRoute.Search),
  )

  const search = pipe(
    literal(slugs.search),
    Route.query(SearchQueryParameters),
    Route.mapTo(ApplicationRoute.Search),
  )

  const wikiArticleBase = pipe(
    schemaSegment("kind", WikiArticleKindFromSlug),
    slash(schemaSegment("handle", Handle)),
  )

  const wikiArticleAbout = pipe(
    wikiArticleBase,
    Route.mapTo({
      make: (lookup: { kind: WikiArticleKind; handle: Handle }) =>
        ApplicationRoute.WikiArticle({ ...lookup, tab: "About" }),
    }),
  )

  const wikiArticleTab = pipe(
    wikiArticleBase,
    slash(schemaSegment("tab", WikiArticleTabFromSlug)),
    Route.mapTo(ApplicationRoute.WikiArticle),
  )

  const wikiArticleDebug = pipe(
    literal("wiki"),
    slash(schemaSegment("wikiArticleId", WikiArticleId)),
    slash(literal("debug")),
    Route.mapTo(ApplicationRoute.WikiArticleDebug),
  )

  const profileBase = pipe(literal(slugs.profile), slash(schemaSegment("handle", Handle)))

  const profileHome = pipe(
    profileBase,
    Route.mapTo({
      make: ({ handle }: { handle: Handle }) => ApplicationRoute.Profile({ handle, tab: "Home" }),
    }),
  )

  const profileTab = pipe(
    profileBase,
    slash(schemaSegment("tab", ProfileTabFromSlug)),
    Route.mapTo(ApplicationRoute.Profile),
  )

  const login = pipe(literal("login"), Route.mapTo(ApplicationRoute.Login))

  const ProfileEditorSectionFromSlug = slugCodec(slugs.profileEditorSections, ProfileEditorSection)

  const profileEditorHome = pipe(
    literal(slugs.profileEditor),
    Route.mapTo({
      make: () => ApplicationRoute.ProfileEditor({ section: "About" }),
    }),
  )

  const profileEditorSection = pipe(
    literal(slugs.profileEditor),
    slash(schemaSegment("section", ProfileEditorSectionFromSlug)),
    Route.mapTo(ApplicationRoute.ProfileEditor),
  )

  const externalDataAdminDashboard = pipe(
    literal(slugs.externalDataAdminDashboard),
    Route.query(observationLogQueryParameters(slugs)),
    Route.mapTo(ApplicationRoute.ExternalDataAdminDashboard),
  )

  const parse = Route.parseUrlWithFallback(
    Route.oneOf(
      home,
      search,
      login,
      profileEditorSection,
      profileEditorHome,
      externalDataAdminDashboard,
      wikiArticleDebug,
      profileTab,
      profileHome,
      wikiArticleTab,
      wikiArticleAbout,
    ),
    ApplicationRoute.NotFound,
  )

  return {
    parse,
    search,
    login,
    profileEditorHome,
    profileEditorSection,
    externalDataAdminDashboard,
    wikiArticleDebug,
    wikiArticleAbout,
    wikiArticleTab,
    profileHome,
    profileTab,
  }
}

const routers = Record.map(pathSlugs, makeRouters)

/** Puts the language first: `/buscar?q=x` in Portuguese is `/pt/buscar?q=x`, and `/` is `/pt`. */
const prefixed = (language: SupportedLanguage, path: string): string =>
  path === "/"
    ? `/${language}`
    : path.startsWith("/?")
      ? `/${language}${path.slice(1)}`
      : `/${language}${path}`

/** A URL's route, and its language when the path starts with one. */
export type LocatedRoute = Readonly<{
  maybeLanguage: Option.Option<SupportedLanguage>
  route: ApplicationRoute
}>

/**
 * Paths without a language are today's Portuguese URLs, read so they can redirect to the same page
 * in the reader's language.
 */
export const urlToLocatedRoute = (url: Url): LocatedRoute => {
  const [, first = "", ...rest] = url.pathname.split("/")

  return Schema.is(SupportedLanguage)(first)
    ? {
        maybeLanguage: Option.some(first),
        route: routers[first].parse({ ...url, pathname: `/${rest.join("/")}` }),
      }
    : { maybeLanguage: Option.none(), route: routers.pt.parse(url) }
}

export const observationLogQueryOf = ({
  _tag,
  ...query
}: typeof ApplicationRoute.ExternalDataAdminDashboard.Type): ObservationLogQuery => query

export const searchUrl = (language: SupportedLanguage, query: Partial<SearchQuery> = {}): string =>
  prefixed(language, routers[language].search({ query: { ...emptySearchQuery, ...query } }))

/** The About tab is the article's bare path. */
export const wikiArticleUrl = (
  language: SupportedLanguage,
  {
    kind,
    handle,
    tab = "About",
  }: Readonly<{ kind: WikiArticleKind; handle: Handle; tab?: WikiArticleTab }>,
): string =>
  prefixed(
    language,
    tab === "About"
      ? routers[language].wikiArticleAbout({ kind, handle, tab })
      : routers[language].wikiArticleTab({ kind, handle, tab }),
  )

export const wikiArticleDebugUrl = (language: SupportedLanguage, wikiArticleId: WikiArticleId) =>
  prefixed(language, routers[language].wikiArticleDebug({ wikiArticleId }))

/** The home tab is the profile's bare path. */
export const profileUrl = (
  language: SupportedLanguage,
  { handle, tab = "Home" }: Readonly<{ handle: Handle; tab?: ProfileTab }>,
): string =>
  prefixed(
    language,
    tab === "Home"
      ? routers[language].profileHome({ handle, tab })
      : routers[language].profileTab({ handle, tab }),
  )

export const loginUrl = (language: SupportedLanguage): string =>
  prefixed(language, routers[language].login())

/** The About section is the editor's bare path. */
export const profileEditorUrl = (
  language: SupportedLanguage,
  section: ProfileEditorSection = "About",
): string =>
  prefixed(
    language,
    section === "About"
      ? routers[language].profileEditorHome({ section })
      : routers[language].profileEditorSection({ section }),
  )

export const observationLogUrl = (
  language: SupportedLanguage,
  query: Partial<ObservationLogQuery> = {},
): string =>
  prefixed(
    language,
    routers[language].externalDataAdminDashboard({ ...emptyObservationLogQuery, ...query }),
  )

/** Identifies a log by its filters alone, so reading it in another language keeps it loaded. */
export const observationLogQueryKey: (query: ObservationLogQuery) => string =
  routers.pt.externalDataAdminDashboard

/** The same page in a language: what language links and redirects point to. */
export const applicationRouteUrl = (language: SupportedLanguage, route: ApplicationRoute): string =>
  ApplicationRoute.match(route, {
    Search: ({ query }) => searchUrl(language, query),
    WikiArticle: ({ kind, handle, tab }) => wikiArticleUrl(language, { kind, handle, tab }),
    WikiArticleDebug: ({ wikiArticleId }) => wikiArticleDebugUrl(language, wikiArticleId),
    Profile: ({ handle, tab }) => profileUrl(language, { handle: handle, tab }),
    Login: () => loginUrl(language),
    ProfileEditor: ({ section }) => profileEditorUrl(language, section),
    ExternalDataAdminDashboard: (log) => observationLogUrl(language, observationLogQueryOf(log)),
    NotFound: () => searchUrl(language),
  })

/** Where a path without a language goes: the same page in `language`, keeping unknown paths. */
export const languageRedirectUrl = (language: SupportedLanguage, url: Url): string => {
  const { route } = urlToLocatedRoute(url)
  const search = Option.match(url.search, { onNone: () => "", onSome: (query) => `?${query}` })

  return ApplicationRoute.guards.NotFound(route)
    ? prefixed(language, `${url.pathname}${search}`)
    : applicationRouteUrl(language, route)
}
