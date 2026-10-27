import { Option, Schema } from 'effect'

import { DialogBlock } from '@foldkit/ui'

import {
  GridSizeRadioGroupBlock,
  PaletteRadioGroupBlock,
  ThemeListboxBlock,
  ToolRadioGroupBlock,
} from './components'

// CONSTANT

export const PaletteIndex = Schema.Literals([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
])

export const HexColor = Schema.String.check(
  Schema.isPattern(/^#[0-9a-f]{6}$/),
).pipe(Schema.brand('HexColor'))

export const Tool = Schema.Literals(['Brush', 'Fill', 'Eraser'])

export const MirrorMode = Schema.Literals([
  'None',
  'Horizontal',
  'Vertical',
  'Both',
])

export const Cell = Schema.Option(PaletteIndex)

const Row = Schema.Array(Cell)
export const Grid = Schema.Array(Row)

export const Position = Schema.Struct({ x: Schema.Number, y: Schema.Number })

const SavedCell = Schema.Option(PaletteIndex)
const SavedRow = Schema.Array(SavedCell)
const SavedGrid = Schema.Array(SavedRow)

export const SavedCanvas = Schema.Struct({
  grid: SavedGrid,
  gridSize: Schema.Number,
  paletteThemeIndex: Schema.Number,
  selectedColorIndex: PaletteIndex,
})

export const SavedCanvasJsonString = Schema.fromJsonString(
  Schema.toCodecJson(SavedCanvas),
)

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
  errorDialog: DialogBlock.Model,
  maybeExportError: Schema.Option(Schema.String),
  paletteThemeIndex: Schema.Number,
  gridSizeConfirmDialog: DialogBlock.Model,
  maybePendingGridSize: Schema.Option(Schema.Number),
  themeListbox: ThemeListboxBlock.Model,
  toolRadioGroup: ToolRadioGroupBlock.Model,
  gridSizeRadioGroup: GridSizeRadioGroupBlock.Model,
  paletteRadioGroup: PaletteRadioGroupBlock.Model,
})

export const paletteIndexFromValue = (
  value: string,
  fallback: typeof PaletteIndex.Type,
): typeof PaletteIndex.Type =>
  Option.getOrElse(
    Schema.decodeUnknownOption(PaletteIndex)(Number(value)),
    () => fallback,
  )
