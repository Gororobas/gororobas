import { Program as RootProgram } from 'foldkit'
import { make as makeProgram } from 'foldkit/program'
import * as ProgramModule from 'foldkit/program'

RootProgram.make({ block: ApplicationBlock, container, freezeModel: true })
makeProgram({
  block: ApplicationBlock,
  container,
  slow: { thresholdOverrides: { View: 32 } },
})
ProgramModule.makeElement({ block: ApplicationBlock, slow: true })

export const makeLocal = (Program: {
  make: (config: unknown) => unknown
}) => Program.make({ freezeModel: false, slow: false })
