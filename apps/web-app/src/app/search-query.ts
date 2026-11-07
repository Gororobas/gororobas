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
import { WikiArticleKind } from "@gororobas/domain/wiki/domain"
import { Match, Option, Schema } from "effect"

/** The kinds of result a search shows, which recent searches also remember. */
export const SearchType = Schema.Literals(["wiki", "publications", "people"])
export type SearchType = typeof SearchType.Type

const FilteredWikiKind = Schema.Literals([
  "PLANT",
  "ANIMAL",
  "TOOL",
  "RESOURCE",
  "NOTEWORTHY_ENTITY",
])

const UnfilteredWikiKind = Schema.Literals(
  WikiArticleKind.literals.filter(
    (kind): kind is Exclude<WikiArticleKind, typeof FilteredWikiKind.Type> =>
      !Schema.is(FilteredWikiKind)(kind),
  ),
)

/** A chosen article kind with the filters only that kind offers, such as a plant's uses. */
export const WikiKindFilters = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("PLANT"),
    plantUsages: Schema.Array(PlantUsage),
    edibleParts: Schema.Array(EdiblePlantPart),
    plantLifecycles: Schema.Array(PlantLifecycle),
    strata: Schema.Array(AgroforestryStratum),
    plantingMethods: Schema.Array(PlantingMethod),
  }),
  Schema.Struct({ kind: Schema.Literal("ANIMAL"), animalRoles: Schema.Array(AnimalRole) }),
  Schema.Struct({ kind: Schema.Literal("TOOL"), toolUsages: Schema.Array(ToolUsage) }),
  Schema.Struct({
    kind: Schema.Literal("RESOURCE"),
    resourceFormats: Schema.Array(ResourceFormat),
  }),
  Schema.Struct({
    kind: Schema.Literal("NOTEWORTHY_ENTITY"),
    entityTypes: Schema.Array(NoteworthyEntityType),
  }),
  Schema.Struct({ kind: UnfilteredWikiKind }),
])

export type WikiKindFilters = typeof WikiKindFilters.Type

/** What a search covers. Each type only holds the filters it offers. */
export const SearchScope = Schema.Union([
  Schema.TaggedStruct("Everything", {}),
  Schema.TaggedStruct("Wiki", { maybeKind: Schema.Option(WikiKindFilters) }),
  Schema.TaggedStruct("Publications", { maybeKind: Schema.Option(PublicationKind) }),
  Schema.TaggedStruct("People", { maybeType: Schema.Option(ProfileType) }),
]).pipe(Schema.toTaggedUnion("_tag"))

export type SearchScope = typeof SearchScope.Type

/** Everything a search shows comes from these fields, which live in the URL. */
export const SearchQuery = Schema.Struct({
  text: Schema.Option(Schema.String),
  scope: SearchScope,
})

export type SearchQuery = typeof SearchQuery.Type

export const everything: SearchScope = SearchScope.cases.Everything.make({})

export const emptySearchQuery: SearchQuery = { text: Option.none(), scope: everything }

/** A kind with none of its filters chosen yet. */
export const unfilteredKind = (kind: WikiArticleKind): WikiKindFilters =>
  Match.value(kind).pipe(
    Match.withReturnType<WikiKindFilters>(),
    Match.when("PLANT", (plant) => ({
      kind: plant,
      plantUsages: [],
      edibleParts: [],
      plantLifecycles: [],
      strata: [],
      plantingMethods: [],
    })),
    Match.when("ANIMAL", (animal) => ({ kind: animal, animalRoles: [] })),
    Match.when("TOOL", (tool) => ({ kind: tool, toolUsages: [] })),
    Match.when("RESOURCE", (resource) => ({ kind: resource, resourceFormats: [] })),
    Match.when("NOTEWORTHY_ENTITY", (entity) => ({ kind: entity, entityTypes: [] })),
    Match.orElse((kind) => ({ kind })),
  )

/** The wiki, optionally narrowed to one kind of article. */
export const wikiScope = (maybeKind: Option.Option<WikiArticleKind> = Option.none()): SearchScope =>
  SearchScope.cases.Wiki.make({ maybeKind: Option.map(maybeKind, unfilteredKind) })

export const publicationsScope = (
  maybeKind: Option.Option<PublicationKind> = Option.none(),
): SearchScope => SearchScope.cases.Publications.make({ maybeKind })

export const peopleScope = (maybeType: Option.Option<ProfileType> = Option.none()): SearchScope =>
  SearchScope.cases.People.make({ maybeType })

/** The one type of result a scope narrows to, if any. */
export const scopeType = (scope: SearchScope): Option.Option<SearchType> =>
  SearchScope.match(scope, {
    Everything: () => Option.none(),
    Wiki: () => Option.some("wiki" as const),
    Publications: () => Option.some("publications" as const),
    People: () => Option.some("people" as const),
  })

/** A type's scope without any filter. */
export const scopeOfType = (maybeType: Option.Option<SearchType>): SearchScope =>
  Option.match(maybeType, {
    onNone: () => everything,
    onSome: (type) =>
      Match.value(type).pipe(
        Match.withReturnType<SearchScope>(),
        Match.when("wiki", () => wikiScope()),
        Match.when("publications", () => publicationsScope()),
        Match.when("people", () => peopleScope()),
        Match.exhaustive,
      ),
  })

/** A query in the language its results are read in: either changing searches again. */
export const AnsweredSearch = Schema.Struct({ query: SearchQuery, language: SupportedLanguage })
export type AnsweredSearch = typeof AnsweredSearch.Type
