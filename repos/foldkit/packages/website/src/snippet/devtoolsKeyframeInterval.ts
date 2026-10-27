import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './application'

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
  devTools: {
    keyframeInterval: 1,
  },
})

Runtime.run(program)
