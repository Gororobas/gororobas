import fc from 'fast-check'

import type { Style } from '../src/index.ts'
import {
  CONDITIONS,
  DECLARATIONS,
  type Description,
  fromDescription,
} from './universe.ts'

export { CONDITIONS, DECLARATIONS }

const declaration = fc
  .constantFrom(...DECLARATIONS)
  .chain(([property, values]) =>
    fc.constantFrom(...values).map(value => [property, value] as const),
  )

const block = fc.array(declaration, { minLength: 0, maxLength: 4 }).map(entries => {
  const declarations: Record<string, string> = {}
  for (const [property, value] of entries) {
    delete declarations[property]
    declarations[property] = value
  }
  return declarations
})

export const condition = fc.constantFrom(...CONDITIONS)

export const description: fc.Arbitrary<Description> = fc.array(
  fc.tuple(fc.nat({ max: CONDITIONS.length - 1 }), block),
  { minLength: 0, maxLength: 4 },
)

export const style: fc.Arbitrary<Style.Style> = description.map(fromDescription)
