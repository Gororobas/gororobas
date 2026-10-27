import { Message, Model } from './definition'
import { ProfileComposition } from './composition'
import { update } from './profile'
import { view } from './view'

export const block = ProfileComposition.prepareBlock({
  init: () => ({ model: Model.make({ child: undefined }) }),
  update,
  view,
  operations: {
    requestSave: Message.ClickedSave,
  },
})
