import { Runtime } from 'foldkit'

import { Model, init, update, view } from '../../site/src/snippet/foldkitUi/wiring.ts'

// Mounts the wiring example from the Foldkit UI docs page, unchanged: a
// @foldkit/ui Menu styled only with Pleat.
Runtime.run(
  Runtime.makeElement({
    Model,
    init: () => ({ model: init() }),
    update,
    view,
    container: document.getElementById('root'),
  }),
)
