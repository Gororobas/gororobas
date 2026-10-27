import type { ChartViewBuilder } from './composition'

export const rawAttributeForAnotherLibrary = (h: ChartViewBuilder) =>
  h.Attribute('onclick', 'drawChart()')
