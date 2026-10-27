import { Program } from 'foldkit'

import { ApplicationBlock } from './block'

// ❌ Bad
// Turning off freezeModel silences the dev warning instead of fixing the
// mutation it caught.
const badProgram = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
  freezeModel: false,
})

// ✅ Good
// Leave the guardrail on and fix the in-place mutation it flags.
const goodProgram = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
})
