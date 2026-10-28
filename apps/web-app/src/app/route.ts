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
  ToolUsage,
} from "@gororobas/domain/common/enums"
import { WikiArticleId } from "@gororobas/domain/common/ids"
import { Handle } from "@gororobas/domain/common/primitives"
import { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import {
  Array as EffectArray,
  Effect,
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

// PATH SEGMENTS

/** pt-BR path segments. Other languages add their own table once the interface is localized. */
const wikiKindSlugs = {
  PLANT: "vegetais",
  PLANT_CULTIVAR: "variedades",
  ANIMAL: "animais",
  BOOK: "livros",
  FILM: "filmes",
  CONCEPT: "conceitos",
  TOOL: "ferramentas",
  RESOURCE: "recursos",
  NOTEWORTHY_ENTITY: "organizacoes",
  UNCATEGORIZED: "outros",
} as const satisfies Record<WikiArticleKind, string>

export const WikiArticleTab = Schema.Literals(["About", "Publications", "Photos", "Contributions"])
export type WikiArticleTab = typeof WikiArticleTab.Type

const wikiArticleTabSlugs = {
  About: "sobre",
  Publications: "publicacoes",
  Photos: "fotos",
  Contributions: "contribuicoes",
} as const satisfies Record<WikiArticleTab, string>

const SEARCH_SEGMENT = "buscar"

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
          Option.match(Record.get(bySlug, slug), {
            onNone: () =>
              Effect.fail(new SchemaIssue.InvalidValue({ message: `Unknown slug ${slug}` }, slug)),
            onSome: Effect.succeed,
          }),
        encode: (value) => Effect.succeed<string>(slugs[value]),
      }),
    ),
  )
}

export const WikiArticleKindFromSlug = slugCodec(wikiKindSlugs, WikiArticleKind)
const WikiArticleTabFromSlug = slugCodec(wikiArticleTabSlugs, WikiArticleTab)

// SEARCH QUERY

export const SearchType = Schema.Literals(["wiki", "publications", "people"])
export type SearchType = typeof SearchType.Type

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

const kindParam = Schema.OptionFromOptional(Schema.String).pipe(
  Schema.decodeTo(
    Schema.Option(WikiArticleKind),
    SchemaTransformation.transform<Option.Option<WikiArticleKind>, Option.Option<string>>({
      // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- URL parameters are free text until a known value decodes from them.
      decode: Option.flatMap(Schema.decodeUnknownOption(WikiArticleKindFromSlug)),
      encode: Option.map((kind) => wikiKindSlugs[kind]),
    }),
  ),
)

/** Everything a search shows comes from these fields, which live in the URL. */
export const SearchQuery = Schema.Struct({
  text: Schema.Option(Schema.String),
  type: Schema.Option(SearchType),
  wikiKind: Schema.Option(WikiArticleKind),
  plantUsages: Schema.Array(PlantUsage),
  plantLifecycles: Schema.Array(PlantLifecycle),
  plantingMethods: Schema.Array(PlantingMethod),
  strata: Schema.Array(AgroforestryStratum),
  edibleParts: Schema.Array(EdiblePlantPart),
  animalRoles: Schema.Array(AnimalRole),
  toolUsages: Schema.Array(ToolUsage),
  resourceFormats: Schema.Array(ResourceFormat),
  entityTypes: Schema.Array(NoteworthyEntityType),
  publicationKind: Schema.Option(PublicationKind),
  profileType: Schema.Option(ProfileType),
})

/** The search query as URL parameters, with short pt-BR keys. */
const SearchQueryParameters = Schema.Struct({
  text: optionalParam(Schema.String, "raw"),
  type: optionalParam(SearchType, "raw"),
  wikiKind: kindParam,
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
}).pipe(
  Schema.encodeKeys({
    text: "q",
    type: "t",
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
  }),
)

export type SearchQuery = typeof SearchQuery.Type

export const emptySearchQuery: SearchQuery = {
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

// ROUTES

export const ApplicationRoute = defineRouteUnion({
  Search: SearchQuery.fields,
  WikiArticle: { kind: WikiArticleKind, handle: Handle, tab: WikiArticleTab },
  WikiArticleDebug: { wikiArticleId: WikiArticleId },
  Login: {},
  NotFound: { path: Schema.String },
})

export type ApplicationRoute = typeof ApplicationRoute.Type

const homeRouter = pipe(
  Route.root,
  Route.query(SearchQueryParameters),
  Route.mapTo(ApplicationRoute.Search),
)

export const searchRouter = pipe(
  literal(SEARCH_SEGMENT),
  Route.query(SearchQueryParameters),
  Route.mapTo(ApplicationRoute.Search),
)

const wikiArticleBase = pipe(
  schemaSegment("kind", WikiArticleKindFromSlug),
  slash(schemaSegment("handle", Handle)),
)

const wikiArticleAboutRouter = pipe(
  wikiArticleBase,
  Route.mapTo({
    make: (lookup: { kind: WikiArticleKind; handle: Handle }) =>
      ApplicationRoute.WikiArticle({ ...lookup, tab: "About" }),
  }),
)

const wikiArticleTabRouter = pipe(
  wikiArticleBase,
  slash(schemaSegment("tab", WikiArticleTabFromSlug)),
  Route.mapTo(ApplicationRoute.WikiArticle),
)

export const wikiArticleDebugRouter = pipe(
  literal("wiki"),
  slash(schemaSegment("wikiArticleId", WikiArticleId)),
  slash(literal("debug")),
  Route.mapTo(ApplicationRoute.WikiArticleDebug),
)

export const loginRouter = pipe(literal("login"), Route.mapTo(ApplicationRoute.Login))

export const urlToApplicationRoute = Route.parseUrlWithFallback(
  Route.oneOf(
    homeRouter,
    searchRouter,
    loginRouter,
    wikiArticleDebugRouter,
    wikiArticleTabRouter,
    wikiArticleAboutRouter,
  ),
  ApplicationRoute.NotFound,
)

/** The About tab is the article's bare path. */
export const wikiArticleUrl = (
  lookup: Readonly<{ kind: WikiArticleKind; handle: Handle }>,
  tab: WikiArticleTab = "About",
): string =>
  tab === "About"
    ? wikiArticleAboutRouter({ kind: lookup.kind, handle: lookup.handle, tab })
    : wikiArticleTabRouter({ kind: lookup.kind, handle: lookup.handle, tab })

export const searchQueryOf = ({
  _tag,
  ...query
}: typeof ApplicationRoute.Search.Type): SearchQuery => query

export const searchUrl = (query: Partial<SearchQuery> = {}): string =>
  searchRouter({ ...emptySearchQuery, ...query })
