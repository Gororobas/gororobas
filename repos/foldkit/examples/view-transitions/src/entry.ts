import { Program, Runtime } from 'foldkit'

import { ApplicationBlock, viewTransition } from './application'

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
  routing: {
    onUrlRequest: ApplicationBlock.Message.ClickedLink,
    onUrlChange: ApplicationBlock.Message.ChangedUrl,
  },
  viewTransition,
  devTools: { dispatch: true },
})

Runtime.run(program)
