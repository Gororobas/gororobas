import { Schema } from 'effect'
import type { Attribute, HtmlBuilder } from 'foldkit/html'

// The three axes a scope chooses. They live in the Model like any
// other choice.
export const Mode = Schema.Literals([
  'Light',
  'Dark',
  'HighContrast',
])
export type Mode = typeof Mode.Type

export const Brand = Schema.Literals(['Harbor', 'Orchard'])
export type Brand = typeof Brand.Type

export const Density = Schema.Literals(['Comfortable', 'Compact'])
export type Density = typeof Density.Type

export const Scope = Schema.Struct({
  mode: Mode,
  brand: Brand,
  density: Density,
})
export type Scope = typeof Scope.Type

// A scope sets all three on one element. Aliases resolve where they
// are declared, so a nested scope that changed only its brand would
// leave the semantic colors it inherited pointing at the old one.
export const scopeAttributes = <Message>(
  h: HtmlBuilder<Message>,
  scope: Scope,
): ReadonlyArray<Attribute<Message>> => [
  h.DataAttribute('ds-mode', scope.mode),
  h.DataAttribute('ds-brand', scope.brand),
  h.DataAttribute('ds-density', scope.density),
]

// A panel that reads as the opposite of its surroundings.
export const inverted = (scope: Scope): Scope => ({
  ...scope,
  mode: scope.mode === 'Dark' ? 'Light' : 'Dark',
})
