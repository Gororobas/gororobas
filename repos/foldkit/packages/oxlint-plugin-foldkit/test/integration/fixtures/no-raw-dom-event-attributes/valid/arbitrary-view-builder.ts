type ButtonViewBuilder = Readonly<{
  Attribute: (name: string, value: string) => unknown
}>

export const rawAttributeForAnotherLibrary = (h: ButtonViewBuilder) =>
  h.Attribute('onclick', 'save()')
