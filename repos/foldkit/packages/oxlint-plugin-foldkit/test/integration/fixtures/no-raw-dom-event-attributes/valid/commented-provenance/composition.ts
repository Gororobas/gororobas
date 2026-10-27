/*
import type * as Block from 'foldkit/block'
export type ChartViewBuilder = Block.ViewBuilderFor<typeof ChartComposition>
*/

const example = `
import type * as Block from 'foldkit/block'
export type ChartViewBuilder = Block.ViewBuilderFor<typeof ChartComposition>
`

export type ChartViewBuilder = Readonly<{
  Attribute: (name: string, value: string) => unknown
}>

export const provenanceExample = example
