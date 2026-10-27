import { expect, expectTypeOf } from 'vitest'

import { describe, it } from '@effect/vitest'

import { modifyFields } from './index.js'

describe('modifyFields', () => {
  it('transforms specified fields', () => {
    const result = modifyFields(
      { count: 0, name: 'test' },
      { count: n => n + 1 },
    )
    expect(result).toStrictEqual({ count: 1, name: 'test' })
  })

  it('supports curried form', () => {
    const inc = modifyFields<
      { count: number; name: string },
      { count: (a: number) => number }
    >({
      count: n => n + 1,
    })
    const result = inc({ count: 0, name: 'test' })
    expect(result).toStrictEqual({ count: 1, name: 'test' })
  })

  it('preserves untransformed fields', () => {
    const result = modifyFields(
      { a: 1, b: 'hello', c: true },
      { a: n => n * 2 },
    )
    expect(result).toStrictEqual({ a: 2, b: 'hello', c: true })
  })

  it('preserves branded source fields in data-first calls', () => {
    const Brand: unique symbol = Symbol()
    type Branded = Readonly<{
      count: number
      name: string
      [Brand]: true
    }>
    const branded: Branded = { count: 1, name: 'test', [Brand]: true }
    const result = modifyFields(branded, { count: count => count + 1 })

    expect(result).toStrictEqual({ count: 2, name: 'test', [Brand]: true })
    expectTypeOf(result).toExtend<Branded>()
  })

  it('retains narrower transformed fields and rejects widening', () => {
    const state: Readonly<{ status: 'Idle' | 'Ready' }> = { status: 'Idle' }
    const ready = modifyFields(state, { status: () => 'Ready' })
    const widenStatus = (): string => 'Ready'

    expectTypeOf(ready.status).toEqualTypeOf<'Ready'>()
    // @ts-expect-error A field transform cannot widen its source field.
    modifyFields(state, { status: widenStatus })
  })

  it('handles empty transforms', () => {
    const obj = { x: 1, y: 2 }
    const result = modifyFields(obj, {})
    expect(result).toStrictEqual({ x: 1, y: 2 })
  })

  it('rejects keys not present in the source object', () => {
    // @ts-expect-error - 'typo' is not a key of { count: number }
    modifyFields({ count: 0 }, { typo: (n: number) => n + 1 })
  })
})
