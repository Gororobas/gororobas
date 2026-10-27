import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './application'

const element = Program.makeElement({
  block: ApplicationBlock,
  container: document.getElementById('widget'),
})

Runtime.run(element)
