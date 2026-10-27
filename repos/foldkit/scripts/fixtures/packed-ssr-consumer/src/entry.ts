import { Program, Runtime } from 'foldkit'

import { ApplicationBlock, Flags } from './application'

const program = Program.make({
  block: ApplicationBlock,
  Flags,
  container: document.getElementById('root'),
  devTools: { dispatch: true },
})

Runtime.hydrate(program)
