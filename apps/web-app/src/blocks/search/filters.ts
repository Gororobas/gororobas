import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { ProfileSearchParams } from "@gororobas/domain/profiles/domain"
import type { ApiPublicationSearchParams } from "@gororobas/domain/publications/domain"
import type { WikiSearchParams } from "@gororobas/domain/wiki/domain"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { Array as EffectArray, Match, Option, Record, Schema, String as EffectString } from "effect"

import {
  type SearchQuery,
  SearchScope,
  type SearchType,
  type WikiKindFilters,
  peopleScope,
  publicationsScope,
  scopeType,
  unfilteredKind,
  wikiScope,
} from "../../app/search-query"
import type { Translator } from "../../lib/translations"
import {
  animalRoleLabels,
  ediblePartLabels,
  entityTypeLabels,
  lifecycleLabels,
  plantUsageLabels,
  plantingMethodLabels,
  profileTypeLabels,
  publicationKindLabels,
  resourceFormatLabels,
  stratumLabels,
  toolUsageLabels,
  wikiKindLabels,
} from "../../lib/vocabulary"

export const FilterGroupId = Schema.Literals([
  "wikiKind",
  "plantUsages",
  "edibleParts",
  "plantLifecycles",
  "strata",
  "plantingMethods",
  "animalRoles",
  "toolUsages",
  "resourceFormats",
  "entityTypes",
  "publicationKind",
  "profileType",
])

export type FilterGroupId = typeof FilterGroupId.Type

export type FilterOption = Readonly<{
  label: string
  isSelected: boolean
  /** The query once this option is toggled. */
  toggledQuery: SearchQuery
}>

export type FilterGroup = Readonly<{
  id: FilterGroupId
  label: string
  options: ReadonlyArray<FilterOption>
  selectedCount: number
}>

type FilterInputs = Readonly<{ query: SearchQuery; i18n: Translator }>

const toggled = <A>(selected: ReadonlyArray<A>, value: A): ReadonlyArray<A> =>
  selected.includes(value)
    ? selected.filter((candidate) => candidate !== value)
    : [...selected, value]

/** Multiple-choice filters within one kind, each option toggling its value in `selected`. */
const listGroup = <Value extends string>({
  query,
  i18n,
  id,
  label,
  labels,
  selected,
  toFilters,
}: FilterInputs &
  Readonly<{
    id: FilterGroupId
    label: MessageDescriptor
    labels: Readonly<Record<Value, MessageDescriptor>>
    selected: ReadonlyArray<Value>
    toFilters: (next: ReadonlyArray<Value>) => WikiKindFilters
  }>): FilterGroup => ({
  id,
  label: i18n._(label),
  selectedCount: selected.length,
  options: Record.toEntries(labels).map(([value, optionLabel]): FilterOption => ({
    label: i18n._(optionLabel),
    isSelected: selected.includes(value),
    toggledQuery: {
      ...query,
      scope: SearchScope.cases.Wiki.make({
        maybeKind: Option.some(toFilters(toggled(selected, value))),
      }),
    },
  })),
})

const wikiKindGroup = ({
  query,
  i18n,
  maybeKind,
}: FilterInputs & Readonly<{ maybeKind: Option.Option<WikiKindFilters> }>): FilterGroup => ({
  id: "wikiKind",
  label: i18n._(msg`Kind`),
  selectedCount: Option.isSome(maybeKind) ? 1 : 0,
  options: Record.toEntries(wikiKindLabels).map(([kind, labels]) => {
    const isSelected = Option.exists(maybeKind, (filters) => filters.kind === kind)

    return {
      label: i18n._(labels.plural),
      isSelected,
      // Changing the kind clears the filters only the previous kind offered.
      toggledQuery: {
        ...query,
        scope: wikiScope(isSelected ? Option.none() : Option.some(kind)),
      },
    }
  }),
})

const kindFilterGroups = (
  inputs: FilterInputs,
  filters: WikiKindFilters,
): ReadonlyArray<FilterGroup> =>
  Match.value(filters).pipe(
    Match.withReturnType<ReadonlyArray<FilterGroup>>(),
    Match.discriminators("kind")({
      PLANT: (plant) => [
        listGroup({
          ...inputs,
          id: "plantUsages",
          label: msg`Uses`,
          labels: plantUsageLabels,
          selected: plant.plantUsages,
          toFilters: (plantUsages) => ({ ...plant, plantUsages }),
        }),
        listGroup({
          ...inputs,
          id: "edibleParts",
          label: msg`Edible parts`,
          labels: ediblePartLabels,
          selected: plant.edibleParts,
          toFilters: (edibleParts) => ({ ...plant, edibleParts }),
        }),
        listGroup({
          ...inputs,
          id: "plantLifecycles",
          label: msg`Lifecycle`,
          labels: lifecycleLabels,
          selected: plant.plantLifecycles,
          toFilters: (plantLifecycles) => ({ ...plant, plantLifecycles }),
        }),
        listGroup({
          ...inputs,
          id: "strata",
          label: msg`Stratum`,
          labels: stratumLabels,
          selected: plant.strata,
          toFilters: (strata) => ({ ...plant, strata }),
        }),
        listGroup({
          ...inputs,
          id: "plantingMethods",
          label: msg`Planting`,
          labels: plantingMethodLabels,
          selected: plant.plantingMethods,
          toFilters: (plantingMethods) => ({ ...plant, plantingMethods }),
        }),
      ],
      ANIMAL: (animal) => [
        listGroup({
          ...inputs,
          id: "animalRoles",
          label: msg`Roles`,
          labels: animalRoleLabels,
          selected: animal.animalRoles,
          toFilters: (animalRoles) => ({ ...animal, animalRoles }),
        }),
      ],
      TOOL: (tool) => [
        listGroup({
          ...inputs,
          id: "toolUsages",
          label: msg`Uses`,
          labels: toolUsageLabels,
          selected: tool.toolUsages,
          toFilters: (toolUsages) => ({ ...tool, toolUsages }),
        }),
      ],
      RESOURCE: (resource) => [
        listGroup({
          ...inputs,
          id: "resourceFormats",
          label: msg`Format`,
          labels: resourceFormatLabels,
          selected: resource.resourceFormats,
          toFilters: (resourceFormats) => ({ ...resource, resourceFormats }),
        }),
      ],
      NOTEWORTHY_ENTITY: (entity) => [
        listGroup({
          ...inputs,
          id: "entityTypes",
          label: msg`Category`,
          labels: entityTypeLabels,
          selected: entity.entityTypes,
          toFilters: (entityTypes) => ({ ...entity, entityTypes }),
        }),
      ],
    }),
    Match.orElse(() => []),
  )

const singleGroup = <Value extends string>({
  i18n,
  id,
  label,
  labels,
  selected,
  toQuery,
}: Readonly<{
  i18n: Translator
  id: "publicationKind" | "profileType"
  label: MessageDescriptor
  labels: Readonly<Record<Value, MessageDescriptor>>
  selected: Option.Option<Value>
  toQuery: (next: Option.Option<Value>) => SearchQuery
}>): FilterGroup => ({
  id,
  label: i18n._(label),
  selectedCount: Option.isSome(selected) ? 1 : 0,
  options: Record.toEntries(labels).map(([value, optionLabel]) => {
    const isSelected = Option.contains(selected, value)

    return {
      label: i18n._(optionLabel),
      isSelected,
      toggledQuery: toQuery(isSelected ? Option.none() : Option.some(value)),
    }
  }),
})

/** The one choice a search type narrows by first, shown inline: an article's kind, a post's
 *  format or a profile's type. */
export const primaryFilterGroup = ({ query, i18n }: FilterInputs): Option.Option<FilterGroup> =>
  SearchScope.match(query.scope, {
    Everything: () => Option.none(),
    Wiki: ({ maybeKind }) => Option.some(wikiKindGroup({ query, i18n, maybeKind })),
    Publications: ({ maybeKind }) =>
      Option.some(
        singleGroup({
          i18n,
          id: "publicationKind",
          label: msg`Format`,
          labels: publicationKindLabels,
          selected: maybeKind,
          toQuery: (next) => ({ ...query, scope: publicationsScope(next) }),
        }),
      ),
    People: ({ maybeType }) =>
      Option.some(
        singleGroup({
          i18n,
          id: "profileType",
          label: msg`Profile`,
          labels: profileTypeLabels,
          selected: maybeType,
          toQuery: (next) => ({ ...query, scope: peopleScope(next) }),
        }),
      ),
  })

/** Filters that open once the primary choice is made, such as a plant's uses. */
export const secondaryFilterGroups = (inputs: FilterInputs): ReadonlyArray<FilterGroup> =>
  SearchScope.guards.Wiki(inputs.query.scope)
    ? Option.match(inputs.query.scope.maybeKind, {
        onNone: () => [],
        onSome: (filters) => kindFilterGroups(inputs, filters),
      })
    : []

const selectedCount = (groups: ReadonlyArray<FilterGroup>): number =>
  EffectArray.reduce(groups, 0, (total, group) => total + group.selectedCount)

export const activeSecondaryFilterCount = (inputs: FilterInputs): number =>
  selectedCount(secondaryFilterGroups(inputs))

/** Keeps the primary choice, dropping the filters that depend on it. */
export const clearedSecondaryFilters = (query: SearchQuery): SearchQuery =>
  SearchScope.guards.Wiki(query.scope)
    ? {
        ...query,
        scope: SearchScope.cases.Wiki.make({
          maybeKind: Option.map(query.scope.maybeKind, (filters) => unfilteredKind(filters.kind)),
        }),
      }
    : query

/** No text and no type: the page offers ways in instead of results. */
export const isBrowsing = (query: SearchQuery): boolean =>
  SearchScope.guards.Everything(query.scope) && Option.isNone(nonEmptyText(query))

/** The server's trigram indexes can't match shorter words. */
export const MINIMUM_WORD_LENGTH = 3

/** Text without any word long enough to search for yet, such as "m" or "pé de". */
export const isTextTooShort = (query: SearchQuery): boolean =>
  Option.exists(
    nonEmptyText(query),
    (text) => !text.split(/\s+/).some((word) => word.length >= MINIMUM_WORD_LENGTH),
  )

/** Whether the page shows results of this type, and so should search for them. */
export const isResultTypeShown = (query: SearchQuery, type: SearchType): boolean =>
  !isBrowsing(query) &&
  !isTextTooShort(query) &&
  Option.match(scopeType(query.scope), { onNone: () => true, onSome: (shown) => shown === type })

// API PARAMETERS

/** The query's text, trimmed, when there is any. */
export const nonEmptyText = (query: SearchQuery): Option.Option<string> =>
  Option.filter(Option.map(query.text, EffectString.trim), EffectString.isNonEmpty)

const optionalText = (query: SearchQuery): { readonly text?: string } =>
  Option.match(nonEmptyText(query), { onNone: () => ({}), onSome: (text) => ({ text }) })

const optionalList = <Key extends string, Value>(
  key: Key,
  values: ReadonlyArray<Value>,
): Partial<Record<Key, ReadonlyArray<Value>>> =>
  EffectArray.isReadonlyArrayNonEmpty(values) ? Record.singleton(key, values) : {}

type ApiInputs = Readonly<{ query: SearchQuery; language: SupportedLanguage }>

/** Overviews search every kind; only a chosen kind sends its filters. */
export const wikiSearchParams = ({ query, language }: ApiInputs): WikiSearchParams => {
  const base = { language, ...optionalText(query) }
  const maybeKind = SearchScope.guards.Wiki(query.scope) ? query.scope.maybeKind : Option.none()

  return Option.match(maybeKind, {
    onNone: () => base,
    onSome: (filters): WikiSearchParams =>
      Match.value(filters).pipe(
        Match.withReturnType<WikiSearchParams>(),
        Match.discriminators("kind")({
          PLANT: (plant) => ({
            ...base,
            kind: plant.kind,
            ...optionalList("plantUsages", plant.plantUsages),
            ...optionalList("edibleParts", plant.edibleParts),
            ...optionalList("plantLifecycles", plant.plantLifecycles),
            ...optionalList("strata", plant.strata),
            ...optionalList("plantingMethods", plant.plantingMethods),
          }),
          ANIMAL: (animal) => ({
            ...base,
            kind: animal.kind,
            ...optionalList("animalRoles", animal.animalRoles),
          }),
          TOOL: (tool) => ({
            ...base,
            kind: tool.kind,
            ...optionalList("toolUsages", tool.toolUsages),
          }),
          RESOURCE: (resource) => ({
            ...base,
            kind: resource.kind,
            ...optionalList("resourceFormats", resource.resourceFormats),
          }),
          NOTEWORTHY_ENTITY: (entity) => ({
            ...base,
            kind: entity.kind,
            ...optionalList("entityTypes", entity.entityTypes),
          }),
        }),
        Match.orElse((other) => ({ ...base, kind: other.kind })),
      ),
  })
}

export const publicationSearchParams = ({
  query,
  language,
  pageSize,
}: ApiInputs & Readonly<{ pageSize: number }>): typeof ApiPublicationSearchParams.Type => ({
  ...optionalText(query),
  ...(SearchScope.guards.Publications(query.scope)
    ? Option.match(query.scope.maybeKind, { onNone: () => ({}), onSome: (kind) => ({ kind }) })
    : {}),
  language,
  pageSize,
  currentPage: 0,
})

export const profileSearchParams = (query: SearchQuery): ProfileSearchParams => ({
  ...optionalText(query),
  ...(SearchScope.guards.People(query.scope)
    ? Option.match(query.scope.maybeType, { onNone: () => ({}), onSome: (type) => ({ type }) })
    : {}),
})
