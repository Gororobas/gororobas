import { createLazy as makeLazy } from 'foldkit/html'

import { renderHeader } from './header'

export const view = (model: typeof Model.Type) => {
  const lazyHeader = makeLazy()
  return lazyHeader(renderHeader, [model.title])
}
