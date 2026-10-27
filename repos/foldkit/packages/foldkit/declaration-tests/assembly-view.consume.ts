import type { Element, Program } from 'foldkit/program'

import { application, element } from './assembly-view.accepted.js'

const passiveProgram: Program<undefined, void, never, never, never> =
  application
const passiveElement: Element<undefined, never, never, never> = element
void passiveProgram
void passiveElement
