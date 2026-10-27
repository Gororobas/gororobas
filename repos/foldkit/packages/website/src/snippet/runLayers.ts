import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './block'
import { ApplicationLayer } from './services'

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
})

Runtime.run(program.provide(ApplicationLayer))
