// src/init.ts

import { ApplicationComposition } from './composition'

export const init = ApplicationComposition.makeInit((flags: Flags) => ({
  model: {
    grid: Option.match(flags.maybeSavedCanvas, {
      onNone: () => createEmptyGrid(DEFAULT_GRID_SIZE),
      onSome: ({ grid }) => grid,
    }),
    undoStack: [],
    redoStack: [],
    tool: 'Brush',
    mirrorMode: 'None',
    isDrawing: false,
    maybeHoveredCell: Option.none(),
    // remaining fields elided for brevity
  },
}))

// src/application.ts

import { Block } from 'foldkit'

import { ApplicationComposition } from './composition'
import { init } from './init'
import type { Model } from './model'
import { update } from './update'
import { view } from './view'

const prepare = () =>
  ApplicationComposition.prepareBlock({
    init,
    update,
    view,
  })
export const ApplicationBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)

// src/entry.ts

import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './application'
import { Flags, flags } from './flags'

const program = Program.make({
  block: ApplicationBlock,
  Flags,
  container: document.getElementById('root'),
})

Runtime.run(program, { flags })
