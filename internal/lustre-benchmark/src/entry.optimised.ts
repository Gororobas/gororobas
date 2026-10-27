import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './application.optimised'

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
  devTools: false,
})

Runtime.run(program)
