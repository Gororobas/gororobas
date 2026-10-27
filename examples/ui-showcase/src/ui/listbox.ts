import { Listbox } from '@foldkit/ui'

import type { ListboxItem } from './domain'

export type Character = Readonly<{
  firstName: string
  lastName: string
}>

export const ItemListboxBlock = Listbox.create<typeof ListboxItem.Type>()
export const ItemMultiListboxBlock =
  Listbox.Multi.create<typeof ListboxItem.Type>()
export const CharacterListboxBlock = Listbox.create<Character>()
