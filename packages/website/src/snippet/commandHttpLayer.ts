import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './counterHttpCompletion'
import { ApplicationLayer } from './services'

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
  devTools: { dispatch: true },
})

Runtime.run(program.provide(ApplicationLayer))
