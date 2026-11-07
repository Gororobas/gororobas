import { ProfileType, PublicationKind, SupportedLanguage } from "@gororobas/domain/common/enums"
import { WikiArticleKind, WikiKindSearchFilters } from "@gororobas/domain/wiki/domain"
import { Match, Option, Schema, Struct } from "effect"

/** The kinds of result a search shows, which recent searches also remember. */
export const SearchType = Schema.Literals(["wiki", "publications", "people"])
export type SearchType = typeof SearchType.Type

const [
  plantFilters,
  bookFilters,
  filmFilters,
  noteworthyEntityFilters,
  ,
  animalFilters,
  toolFilters,
  resourceFilters,
  ,
  kindsWithoutFilters,
] = WikiKindSearchFilters.members

/**
 * A chosen article kind with the filters the URL carries for it: the lists each kind offers in the
 * API's `WikiKindSearchFilters`. Ranges (a plant's height, a book's page count…) aren't offered
 * yet, so only the kind remains of those. The API still filters `NOTEWORTHY_PERSON` and
 * `CONTENT_PRODUCER`, which are no longer article kinds, so they're left out.
 */
export const WikiKindFilters = Schema.Union([
  plantFilters.mapFields(
    Struct.pick([
      "kind",
      "plantUsages",
      "edibleParts",
      "plantLifecycles",
      "strata",
      "plantingMethods",
    ]),
  ),
  bookFilters.mapFields(Struct.pick(["kind"])),
  filmFilters.mapFields(Struct.pick(["kind"])),
  noteworthyEntityFilters.mapFields(Struct.pick(["kind", "entityTypes"])),
  animalFilters,
  toolFilters,
  resourceFilters,
  kindsWithoutFilters,
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
export const unfilteredKind = (kind: WikiArticleKind): WikiKindFilters => ({ kind })

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
