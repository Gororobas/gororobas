import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './block'

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
  devTools: {
    dispatch: true,
    excludeFromHistory: [
      'TickedFrame',
      'MovedPointer',
      'CompletedGenerateAmbientParticle',
    ],
  },
})

Runtime.run(program)
