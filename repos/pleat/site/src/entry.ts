import { Runtime } from 'foldkit'
import { __setDevToolsOverlay } from 'foldkit/devtools-host'

import { overlay } from '@foldkit/devtools/vite'

import { Message, Model, init, update, view } from './main.ts'

// NOTE: The Foldkit Vite plugin registers this overlay through Vite's HTML
// transform. The dev server runs that transform on every rendered document, but
// a prerendered build with a script entry has no HTML input, so a production
// bundle would ship without the overlay. Registering it here covers both.
__setDevToolsOverlay(overlay)

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  container: document.getElementById('root'),
  routing: {
    onUrlRequest: request => Message.ClickedLink({ request }),
    onUrlChange: url => Message.UpdatedUrl({ url }),
  },
  devTools: {
    show: 'Always',
    mode: { development: 'TimeTravel', production: 'Inspect' },
    banner:
      'Welcome to Foldkit DevTools. This site runs on Foldkit and is styled with Pleat. Navigate or interact with the page and every action appears here as a Message. Select a row to see the Model it produced.',
    Message,
  },
})

Runtime.hydrate(application)
