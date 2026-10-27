// ❌ Import a component's former loose Model, init, and internal Mount.
import { Schema } from 'effect'
import { Scene } from 'foldkit'

import { Dialog } from '@foldkit/ui'
import { AcquireResources } from '@foldkit/ui/dialog/internal'

const Model = Schema.Struct({ dialog: Dialog.Model })
const model = Model.make({
  dialog: Dialog.init({ id: 'confirm' }).model,
})

Scene.Mount.resolve(
  AcquireResources,
  Dialog.Message.SucceededAcquireResources(),
)
