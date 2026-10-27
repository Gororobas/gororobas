import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './block'
import { handleSlow } from './subscription'

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
  slow: {
    show: 'Always',
    onSlow: handleSlow,
  },
  devTools: { dispatch: true },
})

Runtime.run(program)
