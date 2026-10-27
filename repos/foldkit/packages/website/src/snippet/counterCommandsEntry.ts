import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './counterCommands'

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
})

Runtime.run(program)
