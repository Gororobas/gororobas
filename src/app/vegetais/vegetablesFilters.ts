import { Schema } from 'effect'
import type {
  VegetablesIndexFilterParams,
  VegetablesIndexQueryParams,
} from '@/queries'
import { RangeFormValue } from '@/schemas'
import type { NextSearchParams } from '@/types'
import { VEGETABLES_PER_PAGE } from '@/utils/config'
import { FILTER_DEFINITIONS } from './vegetableFilterDefinitions'

const PAGE_INDEX_QUERY_KEY = 'pagina'

export type VegetablesSearchFormValue = Omit<
  VegetablesIndexQueryParams,
  | 'development_cycle_min'
  | 'development_cycle_max'
  | 'height_min'
  | 'height_max'
  | 'temperature_min'
  | 'temperature_max'
> & {
  height?: typeof RangeFormValue.Type | null
  temperature?: typeof RangeFormValue.Type | null
  development_cycle?: typeof RangeFormValue.Type | null
}

export function vegetablesNextSearchParamsToQueryParams<
  Format extends 'form' | 'search',
>(searchParams: NextSearchParams, format: Format): VegetablesIndexQueryParams {
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

      if (definition.type === 'range') {
        try {
          const [min, max] = Schema.decodeSync(RangeFormValue)(
            JSON.parse(decodeURIComponent(arrayValue[0])),
          )
          if (format === 'form') {
            accFilters[filterKey] = [min, max]
          } else {
            if (min) {
              accFilters[`${filterKey}_min`] = min
            }
            if (max) {
              accFilters[`${filterKey}_max`] = max
            }
          }
        } catch (_error) {} // invalid range
      }

      return accFilters
    },
    {} as Record<
      string,
      | VegetablesIndexQueryParams[keyof VegetablesIndexQueryParams]
      | string[]
      | VegetablesSearchFormValue[keyof VegetablesSearchFormValue]
    >,
  )

  return {
    ...filters,
    offset: pageIndex * VEGETABLES_PER_PAGE,
  } as typeof format extends 'form'
    ? VegetablesSearchFormValue
    : VegetablesIndexQueryParams
}

export function queryParamsToSearchParams(
  filterParams: VegetablesIndexFilterParams,
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

    const { queryKey, type } = definition

    if (type === 'range') {
      // Skip ranges with unset min/max values
      if (Array.isArray(value) && value.some((v) => v !== undefined)) {
        // As ranges have orders and can include `undefined` for unset min/max, we can't `.append` as other generic arrays.
        // Instead, we keep the JSON structure in the query param, which is parsed by `nextSearchParamsToQueryParams`
        searchParams.set(queryKey, encodeURIComponent(JSON.stringify(value)))
      }
    } else if (Array.isArray(value)) {
      value.forEach((entry) => {searchParams.append(queryKey, entry)})
    } else {
      searchParams.set(queryKey, String(value))
    }
  })

  return searchParams
}
