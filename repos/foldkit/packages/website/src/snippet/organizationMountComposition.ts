import { PanelDefinition } from './definition'
import { MeasurePanel } from './mount'

export const PanelComposition = PanelDefinition.makeComposition({
  mounts: [MeasurePanel],
})
