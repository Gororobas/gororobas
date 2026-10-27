import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './block'

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
  routing: {
    onUrlRequest: ApplicationBlock.Message.ClickedLink,
    onUrlChange: ApplicationBlock.Message.ChangedUrl,
  },
  viewTransition: ({ message }) => message._tag === 'ChangedUrl',
})

Runtime.run(program)
