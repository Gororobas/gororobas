import type {
  ResourcesIndexFilterParams,
  ResourcesIndexQueryParams,
} from '@/queries'
import type { NextSearchParams } from '@/types'
import { RESOURCES_PER_PAGE } from '@/utils/config'
import { FILTER_DEFINITIONS } from './resourceFilterDefinitions'

const PAGE_INDEX_QUERY_KEY = 'pagina'

export type ResourcesSearchFormValue = ResourcesIndexQueryParams

export function resourcesNextSearchParamsToQueryParams<
  Format extends 'form' | 'search',
>(searchParams: NextSearchParams, format: Format): ResourcesIndexQueryParams {
  const pageIndex = searchParams[PAGE_INDEX_QUERY_KEY]
    ? Number(searchParams[PAGE_INDEX_QUERY_KEY] as string)
    : 0

  const filters = FILTER_DEFINITIONS.reduce(
    (accFilters, definition) => {
      const { queryKey, filterKey } = definition
      const queryValue = searchParams[queryKey]

      if (!queryValue) return accFilters

      const arrayValue = (
        Array.isArray(queryValue) ? queryValue : [queryValue]
      ).filter(Boolean)

      if (definition.type === 'multiselect') {
        const validValues = arrayValue.filter((value) =>
          definition.values.includes(value),
        )
        if (validValues.length) {
          accFilters[filterKey] = validValues
        }
      }

      if (definition.type === 'search_query') {
        accFilters[filterKey] = arrayValue.join(' ')
      }

      if (definition.type === 'reference') {
        if (arrayValue.length) {
          accFilters[filterKey] = arrayValue
        }
      }

      return accFilters
    },
    {} as Record<
      string,
      | ResourcesIndexQueryParams[keyof ResourcesIndexQueryParams]
      | string[]
      | ResourcesSearchFormValue[keyof ResourcesSearchFormValue]
    >,
  )

  return {
    ...filters,
    offset: pageIndex * RESOURCES_PER_PAGE,
  } as typeof format extends 'form'
    ? ResourcesSearchFormValue
    : ResourcesIndexQueryParams
}

export function queryParamsToSearchParams(
  filterParams: ResourcesIndexFilterParams,
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
