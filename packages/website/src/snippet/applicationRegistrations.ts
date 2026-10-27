import { ApplicationDefinition } from '../definition'
import { Home, Products } from '../page'

export const HomeBinding = ApplicationDefinition.makeBinding(Home.HomeBlock, {
  field: 'home',
})

export const ProductsBinding = ApplicationDefinition.makeBinding(
  Products.ProductsBlock,
  {
    field: 'products',
  },
)

export const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [HomeBinding, ProductsBinding],
})
