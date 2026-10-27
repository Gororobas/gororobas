import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './application'

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
  devTools: {
    excludeFromHistory: ['TickedFrame', 'MovedPointer'],
  },
})

Runtime.run(program)
