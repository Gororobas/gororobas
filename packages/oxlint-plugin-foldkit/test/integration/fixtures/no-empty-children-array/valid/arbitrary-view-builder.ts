type MarketingViewBuilder = Readonly<{
  div: (attrs: ReadonlyArray<unknown>, children: ReadonlyArray<unknown>) => unknown
}>

export const renderDivider = (h: MarketingViewBuilder) => h.div([], [])
