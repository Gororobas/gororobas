import { Schema } from 'effect'

import { Dialog, Listbox, RadioGroup } from '@foldkit/ui'

const ThemeListbox = Listbox.create<Theme>()
const ToolRadioGroup = RadioGroup.create<Tool>()
const GridSizeRadioGroup = RadioGroup.create<number>()
const PaletteRadioGroup = RadioGroup.create<PaletteIndex>()

export const Model = Schema.Struct({
  grid: Grid,
  undoStack: Schema.Array(Grid),
  redoStack: Schema.Array(Grid),
  selectedColorIndex: PaletteIndex,
  gridSize: Schema.Number,
  tool: Tool,
  mirrorMode: MirrorMode,
  isDrawing: Schema.Boolean,
  maybeHoveredCell: Schema.Option(Position),
  errorDialog: Dialog.DialogBlock.Model,
  maybeExportError: Schema.Option(Schema.String),
  paletteThemeIndex: Schema.Number,
  gridSizeConfirmDialog: Dialog.DialogBlock.Model,
  maybePendingGridSize: Schema.Option(Schema.Number),
  themeListbox: ThemeListbox.Model,
  toolRadioGroup: ToolRadioGroup.Model,
  gridSizeRadioGroup: GridSizeRadioGroup.Model,
  paletteRadioGroup: PaletteRadioGroup.Model,
})
