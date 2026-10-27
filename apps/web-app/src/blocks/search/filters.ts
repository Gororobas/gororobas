import type { ProfileSearchParams } from "@gororobas/domain/profiles/domain"
import type { ApiPublicationSearchParams } from "@gororobas/domain/publications/domain"
import type { WikiSearchParams } from "@gororobas/domain/wiki/domain"
import { Array as EffectArray, Match, Option, Record, Schema, String as EffectString } from "effect"

import { type SearchQuery, type SearchType, emptySearchQuery } from "../../app/route"
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

type ListField =
  | "plantUsages"
  | "edibleParts"
  | "plantLifecycles"
  | "strata"
  | "plantingMethods"
  | "animalRoles"
  | "toolUsages"
  | "resourceFormats"
  | "entityTypes"

const listGroup = <Field extends ListField>({
  query,
  id,
  label,
  labels,
}: Readonly<{
  query: SearchQuery
  id: Field
  label: string
  labels: Readonly<Record<SearchQuery[Field][number], string>>
}>): FilterGroup => {
  const selected: ReadonlyArray<string> = query[id]

  const options = Record.toEntries(labels).map(([value, optionLabel]): FilterOption => ({
    label: optionLabel,
    isSelected: selected.includes(value),
    toggledQuery: {
      ...query,
      [id]: selected.includes(value)
        ? selected.filter((candidate) => candidate !== value)
        : [...selected, value],
    },
  }))

  return { id, label, options, selectedCount: selected.length }
}

/** Every kind-specific filter cleared, as when the article kind changes. */
const withoutKindFilters = (query: SearchQuery): SearchQuery => ({
  ...emptySearchQuery,
  text: query.text,
  type: query.type,
  wikiKind: query.wikiKind,
})

const wikiKindGroup = (query: SearchQuery): FilterGroup => ({
  id: "wikiKind",
  label: "Tipo",
  selectedCount: Option.isSome(query.wikiKind) ? 1 : 0,
  options: Record.toEntries(wikiKindLabels).map(([kind, labels]) => {
    const isSelected = Option.contains(query.wikiKind, kind)

    return {
      label: labels.plural,
      isSelected,
      toggledQuery: withoutKindFilters({
        ...query,
        wikiKind: isSelected ? Option.none() : Option.some(kind),
      }),
    }
  }),
})

const wikiKindFilterGroups = (query: SearchQuery): ReadonlyArray<FilterGroup> =>
  Option.match(query.wikiKind, {
    onNone: () => [],
    onSome: (kind) =>
      Match.value(kind).pipe(
        Match.withReturnType<ReadonlyArray<FilterGroup>>(),
        Match.when("PLANT", () => [
          listGroup({ query, id: "plantUsages", label: "Usos", labels: plantUsageLabels }),
          listGroup({
            query,
            id: "edibleParts",
            label: "Partes comestíveis",
            labels: ediblePartLabels,
          }),
          listGroup({
            query,
            id: "plantLifecycles",
            label: "Ciclo de vida",
            labels: lifecycleLabels,
          }),
          listGroup({ query, id: "strata", label: "Estrato", labels: stratumLabels }),
          listGroup({
            query,
            id: "plantingMethods",
            label: "Plantio",
            labels: plantingMethodLabels,
          }),
        ]),
        Match.when("ANIMAL", () => [
          listGroup({ query, id: "animalRoles", label: "Papéis", labels: animalRoleLabels }),
        ]),
        Match.when("TOOL", () => [
          listGroup({ query, id: "toolUsages", label: "Usos", labels: toolUsageLabels }),
        ]),
        Match.when("RESOURCE", () => [
          listGroup({
            query,
            id: "resourceFormats",
            label: "Formato",
            labels: resourceFormatLabels,
          }),
        ]),
        Match.when("NOTEWORTHY_ENTITY", () => [
          listGroup({ query, id: "entityTypes", label: "Categoria", labels: entityTypeLabels }),
        ]),
        Match.orElse(() => []),
      ),
  })

const singleGroup = <Value extends string>({
  id,
  label,
  labels,
  selected,
  toQuery,
}: Readonly<{
  id: "publicationKind" | "profileType"
  label: string
  labels: Readonly<Record<Value, string>>
  selected: Option.Option<Value>
  toQuery: (next: Option.Option<Value>) => SearchQuery
}>): FilterGroup => ({
  id,
  label,
  selectedCount: Option.isSome(selected) ? 1 : 0,
  options: Record.toEntries(labels).map(([value, optionLabel]) => {
    const isSelected = Option.contains(selected, value)

    return {
      label: optionLabel,
      isSelected,
      toggledQuery: toQuery(isSelected ? Option.none() : Option.some(value)),
    }
  }),
})

/** The one choice a search type narrows by first, shown inline: an article's kind, a post's
 *  format or a profile's type. */
export const primaryFilterGroup = (query: SearchQuery): Option.Option<FilterGroup> =>
  Option.map(query.type, (type) =>
    Match.value(type).pipe(
      Match.withReturnType<FilterGroup>(),
      Match.when("wiki", () => wikiKindGroup(query)),
      Match.when("publications", () =>
        singleGroup({
          id: "publicationKind",
          label: "Formato",
          labels: publicationKindLabels,
          selected: query.publicationKind,
          toQuery: (next) => ({ ...query, publicationKind: next }),
        }),
      ),
      Match.when("people", () =>
        singleGroup({
          id: "profileType",
          label: "Perfil",
          labels: profileTypeLabels,
          selected: query.profileType,
          toQuery: (next) => ({ ...query, profileType: next }),
        }),
      ),
      Match.exhaustive,
    ),
  )

/** Filters that open once the primary choice is made, such as a plant's uses. */
export const secondaryFilterGroups = (query: SearchQuery): ReadonlyArray<FilterGroup> =>
  Option.contains(query.type, "wiki") ? wikiKindFilterGroups(query) : []

/** Every filter a search type offers, in order of importance. */
export const filterGroups = (query: SearchQuery): ReadonlyArray<FilterGroup> => [
  ...Option.toArray(primaryFilterGroup(query)),
  ...secondaryFilterGroups(query),
]

const selectedCount = (groups: ReadonlyArray<FilterGroup>): number =>
  EffectArray.reduce(groups, 0, (total, group) => total + group.selectedCount)

export const activeFilterCount = (query: SearchQuery): number => selectedCount(filterGroups(query))

export const activeSecondaryFilterCount = (query: SearchQuery): number =>
  selectedCount(secondaryFilterGroups(query))

/** Keeps the text and type, dropping every filter. */
export const clearedFilters = (query: SearchQuery): SearchQuery => ({
  ...emptySearchQuery,
  text: query.text,
  type: query.type,
})

/** Keeps the primary choice, dropping the filters that depend on it. */
export const clearedSecondaryFilters = withoutKindFilters

/** No text and no type: the page offers ways in instead of results. */
export const isBrowsing = (query: SearchQuery): boolean =>
  Option.isNone(query.type) && Option.isNone(nonEmptyText(query))

/** Whether the page shows results of this type, and so should search for them. */
export const isResultTypeShown = (query: SearchQuery, type: SearchType): boolean =>
  !isBrowsing(query) &&
  Option.match(query.type, { onNone: () => true, onSome: (shown) => shown === type })

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

export const wikiSearchParams = (query: SearchQuery): WikiSearchParams => {
  const base = { language: "pt" as const, ...optionalText(query) }

  return Option.match(query.wikiKind, {
    onNone: () => base,
    onSome: (kind): WikiSearchParams =>
      Match.value(kind).pipe(
        Match.withReturnType<WikiSearchParams>(),
        Match.when("PLANT", (plant) => ({
          ...base,
          kind: plant,
          ...optionalList("plantUsages", query.plantUsages),
          ...optionalList("edibleParts", query.edibleParts),
          ...optionalList("plantLifecycles", query.plantLifecycles),
          ...optionalList("strata", query.strata),
          ...optionalList("plantingMethods", query.plantingMethods),
        })),
        Match.when("ANIMAL", (animal) => ({
          ...base,
          kind: animal,
          ...optionalList("animalRoles", query.animalRoles),
        })),
        Match.when("TOOL", (tool) => ({
          ...base,
          kind: tool,
          ...optionalList("toolUsages", query.toolUsages),
        })),
        Match.when("RESOURCE", (resource) => ({
          ...base,
          kind: resource,
          ...optionalList("resourceFormats", query.resourceFormats),
        })),
        Match.when("NOTEWORTHY_ENTITY", (entity) => ({
          ...base,
          kind: entity,
          ...optionalList("entityTypes", query.entityTypes),
        })),
        Match.when("BOOK", (book) => ({ ...base, kind: book })),
        Match.when("FILM", (film) => ({ ...base, kind: film })),
        Match.orElse((other) => ({ ...base, kind: other })),
      ),
  })
}

export const publicationSearchParams = (
  query: SearchQuery,
  pageSize: number,
): typeof ApiPublicationSearchParams.Type => ({
  ...optionalText(query),
  ...Option.match(query.publicationKind, { onNone: () => ({}), onSome: (kind) => ({ kind }) }),
  language: "pt",
  pageSize,
  currentPage: 0,
})

export const profileSearchParams = (query: SearchQuery): ProfileSearchParams => ({
  ...optionalText(query),
  ...Option.match(query.profileType, { onNone: () => ({}), onSome: (type) => ({ type }) }),
})
