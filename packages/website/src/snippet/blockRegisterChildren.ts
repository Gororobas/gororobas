import * as Composer from './composer'
import { ChatDefinition } from './definition'

export const PrimaryComposerBinding = ChatDefinition.makeBinding(
  Composer.ComposerBlock,
  {
    field: 'primaryComposer',
  },
)

export const SecondaryComposerBinding = ChatDefinition.makeBinding(
  Composer.ComposerBlock,
  {
    field: 'secondaryComposer',
  },
)

export const ChatComposition = ChatDefinition.makeComposition({
  bindings: [PrimaryComposerBinding, SecondaryComposerBinding],
})
