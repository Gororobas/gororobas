import { Style, Theme } from '@pleat/core'
import { css } from '@pleat/foldkit'

import { brandKit } from './tokens.ts'

// Values from a settings form, an API, or a language model are
// decoded against each token's kind, never trusted. Any of them may
// be left out; the scope's own brand supplies the rest.
export const decodeBrand = (input: unknown) =>
  Theme.decodePartial(Theme.empty, brandKit, input)

// A decoded theme is a list of checked custom properties, so one
// element can carry it inline, in the same css() call as its styles.
// Every alias below it follows.
export const branded = (
  theme: Theme.Theme,
  ...styles: ReadonlyArray<Style.Style>
) => css(...styles, ...Theme.bindings(theme))
