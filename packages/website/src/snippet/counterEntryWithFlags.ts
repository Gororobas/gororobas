import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './counterApplicationWithFlags'
import { Flags, flags } from './flagsDefinition'
import { ApplicationLayer } from './services'

const program = Program.make({
  block: ApplicationBlock,
  Flags,
  container: document.getElementById('root'),
})

Runtime.run(program.provide(ApplicationLayer), { flags })
