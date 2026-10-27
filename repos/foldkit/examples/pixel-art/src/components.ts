import { Listbox, RadioGroup } from '@foldkit/ui'

import type { Tool } from './model'

export const TOOL_RADIO_GROUP_ID = 'tool-picker'
export const GRID_SIZE_RADIO_GROUP_ID = 'grid-size-picker'
export const PALETTE_RADIO_GROUP_ID = 'palette-picker'

export const ThemeListboxBlock = Listbox.create()
export const ToolRadioGroupBlock = RadioGroup.create<typeof Tool.Type>()
export const GridSizeRadioGroupBlock = RadioGroup.create()
export const PaletteRadioGroupBlock = RadioGroup.create()
