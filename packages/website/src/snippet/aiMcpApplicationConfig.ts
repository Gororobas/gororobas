import { Program } from 'foldkit'

import { ApplicationBlock } from './block'

Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
  devTools: { dispatch: true },
})
