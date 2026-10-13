import { Option } from 'effect'
import { click, expect, given, role, scene } from 'foldkit/scene'
import { fromString } from 'foldkit/url'
import { describe, test } from 'vitest'

import { init, update, view } from './main.ts'

const initialModel = init(Option.getOrThrow(fromString('https://pleat.example/'))).model

describe('recipe playground', () => {
  test('the view wires recipe choices and pending state to the Model', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(role('button', { name: 'Save changes' })).toExist(),
      click(role('button', { name: 'Quiet' })),
      click(role('button', { name: 'Large' })),
      click(role('button', { name: 'true' })),
      expect(role('button', { name: 'Saving…' })).toExist(),
      click(role('button', { name: 'false' })),
      expect(role('button', { name: 'Save changes' })).toExist(),
    )
  })
})
