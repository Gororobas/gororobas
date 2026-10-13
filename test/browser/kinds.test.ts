import { Exit, Schema } from 'effect'
import type { Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { Token } from '@pleat/core'

import { launch } from './chromium.ts'

// The claim under test: a value the Color kind accepts is a color the browser keeps. The
// kind checks shape, not arguments, so the candidates are names and hex, where a shape check
// can be exact.

// NOTE: the names come from the kind's own pattern, so the test checks the list the
// schema enforces rather than a copy of it.
const namedColors = (): ReadonlyArray<string> => {
  const sources = Token.color.schema.ast.checks?.map(check =>
    JSON.stringify(check.annotations?.['representation'] ?? null),
  )
  const names = sources
    ?.map(source => /\|\(([A-Za-z|]+)\)\|/.exec(source)?.[1])
    .find(match => match !== undefined)
  return names === undefined ? [] : names.split('|')
}

const CANDIDATES = [
  'bananas',
  'tealish',
  'inherit',
  'initial',
  'none',
  'auto',
  '#1',
  '#12',
  '#123',
  '#1234',
  '#12345',
  '#123456',
  '#1234567',
  '#12345678',
  '#123456789',
  '#ggg',
]

let browser: Browser

beforeAll(async () => {
  browser = await launch()
})

afterAll(async () => {
  await browser?.close()
})

describe('Token.color accepts only colors Chromium keeps', () => {
  test('every accepted name and hex is a color', async () => {
    const names = namedColors()
    const decode = Schema.decodeUnknownExit(Token.color.schema)
    const accepted = [...names, ...CANDIDATES].filter(candidate =>
      Exit.isSuccess(decode(candidate)),
    )
    const page = await browser.newPage()
    const supported = await page.evaluate(
      candidates => candidates.map(candidate => CSS.supports('color', candidate)),
      accepted,
    )
    await page.close()
    const dropped = accepted.filter((_, index) => supported[index] !== true)
    expect(dropped).toEqual([])
    expect(names).toContain('rebeccapurple')
    expect(names).toContain('Canvas')
    expect(accepted).toEqual(
      expect.arrayContaining(['#123', '#1234', '#123456', '#12345678']),
    )
  })
})
