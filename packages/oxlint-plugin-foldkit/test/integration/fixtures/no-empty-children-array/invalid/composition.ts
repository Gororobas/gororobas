import type * as Block from 'foldkit/block'

export declare const ExtractedViewComposition: Readonly<{
  makeView: unknown
}>

export type ExtractedViewBuilder = Block.ViewBuilderFor<
  typeof ExtractedViewComposition
>
