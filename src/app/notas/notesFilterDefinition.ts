import { SearchIcon, ShapesIcon } from 'lucide-react'
import type { NotesIndexFilterParams, NotesIndexQueryParams } from '@/queries'
import type { NextSearchParams } from '@/types'
import { NOTES_PER_PAGE } from '@/utils/config'
import { NOTE_TYPE_TO_LABEL } from '@/utils/labels'
import type { FilterDefinition } from '../vegetais/vegetableFilterDefinitions'

const PAGE_INDEX_QUERY_KEY = 'pagina'
const FILTER_DEFINITIONS = [
  {
    queryKey: 'busca',
    filterKey: 'search_query',
    label: 'Buscar por nome',
    type: 'search_query',
    icon: SearchIcon,
  },
  {
    queryKey: 'tipo',
    filterKey: 'types',
    type: 'multiselect',
    label: 'Tipo(s) de nota',
    values: Object.keys(NOTE_TYPE_TO_LABEL),
    valueLabels: NOTE_TYPE_TO_LABEL,
    icon: ShapesIcon,
  },
] as const satisfies FilterDefinition[]

export function queryParamsToSearchParams(
  filterParams: NotesIndexFilterParams,
  pageIndex?: number,
): URLSearchParams {
  const searchParams = new URLSearchParams()
  if (pageIndex) {
    searchParams.set(PAGE_INDEX_QUERY_KEY, String(pageIndex))
  }

  // Set all filters
  Object.entries(filterParams).forEach(([key, value]) => {
    const definition = FILTER_DEFINITIONS.find(
      (definition) => definition.filterKey === key,
    )
    if (!definition || !value) return

    const { queryKey } = definition

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        searchParams.append(queryKey, entry)
      })
    } else {
      searchParams.set(queryKey, String(value))
    }
  })

  return searchParams
}

export function notesNextSearchParamsToQueryParams(
  searchParams: NextSearchParams,
): NotesIndexQueryParams {
  const pageIndex = searchParams[PAGE_INDEX_QUERY_KEY]
    ? Number(searchParams[PAGE_INDEX_QUERY_KEY] as string)
    : 0

  const filters = FILTER_DEFINITIONS.reduce(
    (accFilters, definition) => {
      const { queryKey, filterKey } = definition
      const queryValue = searchParams[queryKey]
      if (!queryValue) return accFilters

      if (definition.type === 'multiselect') {
        const arrayValue = Array.isArray(queryValue) ? queryValue : [queryValue]
        const validValues = arrayValue.filter((value) =>
          definition.values.includes(value),
        )

        if (validValues.length) {
          accFilters[filterKey] = validValues
        }
      }

      if (definition.type === 'search_query') {
        accFilters[filterKey] = [queryValue].flat().join(' ')
      }

      return accFilters
    },
    {} as Record<string, string[] | string>,
  )

  return {
    ...filters,
    offset: pageIndex * NOTES_PER_PAGE,
  } as NotesIndexQueryParams
}
