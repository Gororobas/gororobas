import type { ButtonViewBuilder } from './composition'

export const renderButton = (h: ButtonViewBuilder) =>
  h.button([h.Attribute('onclick', 'save()')])
