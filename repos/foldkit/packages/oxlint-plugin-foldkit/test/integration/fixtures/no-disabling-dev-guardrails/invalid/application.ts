import { Program as RootProgram } from 'foldkit'
import {
  make as makeProgram,
  makeElement as makeProgramElement,
} from 'foldkit/program'
import * as ProgramModule from 'foldkit/program'

RootProgram.make({ block: ApplicationBlock, container, freezeModel: false })
makeProgram({ block: ApplicationBlock, container, slow: false })
makeProgramElement({ block: ApplicationBlock, freezeModel: false })
ProgramModule.makeElement({ block: ApplicationBlock, slow: false })
