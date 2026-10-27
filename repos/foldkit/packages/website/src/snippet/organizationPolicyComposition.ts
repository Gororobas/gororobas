import * as Counter from '../../counter'
import { EditorDefinition } from '../definition'
import { FocusEditor } from '../mount'
import { DialogBinding } from './dialog'

export const CounterBinding = EditorDefinition.makeBinding(
  Counter.CounterBlock,
  {
    field: 'counter',
  },
)

export const EditorComposition = EditorDefinition.makeComposition({
  bindings: [CounterBinding, DialogBinding],
  mounts: [FocusEditor],
})
