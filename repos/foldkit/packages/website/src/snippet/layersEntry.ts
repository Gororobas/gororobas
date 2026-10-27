import { Program, Runtime } from 'foldkit'

import { ApplicationLayer } from './layers'
import { ApplicationBlock } from './layersApplication'

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
})

Runtime.run(program.provide(ApplicationLayer))
