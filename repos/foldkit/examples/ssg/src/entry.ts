import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './application'
import './styles.css'

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
  routing: {
    onUrlRequest: ApplicationBlock.Message.ClickedLink,
    onUrlChange: ApplicationBlock.Message.ChangedUrl,
  },
  devTools: { dispatch: true },
})

Runtime.hydrate(program)
