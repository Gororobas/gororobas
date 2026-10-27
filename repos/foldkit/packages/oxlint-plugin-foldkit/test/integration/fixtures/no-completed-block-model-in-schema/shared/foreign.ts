const Registry = {
  makeDefinition: () => ({
    makeComposition: () => ({
      prepareBlock: () => ({ Model: 'unrelated' }),
    }),
  }),
}
const ChildDefinition = Registry.makeDefinition()
const ChildComposition = ChildDefinition.makeComposition()
export const ChildBlock = ChildComposition.prepareBlock()
