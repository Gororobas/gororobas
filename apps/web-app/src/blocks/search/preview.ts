import type { ColumnCount } from "../../ui/styles/result-grid"

// How many results the overview previews at each column count: whole rows, so a preview with
// more results than it shows never ends on a gap.

export const articlesShownAt = (columns: ColumnCount): number => (columns === 1 ? 4 : columns * 2)

export const publicationsShownAt = (columns: ColumnCount): number => (columns === 1 ? 3 : columns)

export const profilesShownAt = (columns: ColumnCount): number => (columns === 1 ? 4 : columns * 2)
