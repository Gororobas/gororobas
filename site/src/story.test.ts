import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { fromString } from 'foldkit/url'
import { describe, expect, test } from 'vitest'

import { Message, init, update } from './main.ts'

const initialModel = init(Option.getOrThrow(fromString('https://pleat.example/'))).model

describe('site choices', () => {
  test('changing one recipe dimension preserves the other choices', () => {
    story(
      update,
      given(initialModel),
      message(Message.SelectedTone({ tone: 'Quiet' })),
      message(Message.SelectedSize({ size: 'Large' })),
      message(Message.UpdatedPending({ isPending: true })),
      message(Message.SelectedTone({ tone: 'Neutral' })),
      Command.expectNone(),
      model(model => {
        expect(model.playground).toEqual({
          tone: 'Neutral',
          size: 'Large',
          isPending: true,
        })
        expect(model.theming).toEqual(initialModel.theming)
      }),
    )
  })

  test('theme axes survive editing a brand and selecting another preset', () => {
    story(
      update,
      given(initialModel),
      message(Message.SelectedMode({ mode: 'Dark' })),
      message(Message.SelectedBrand({ brand: 'Orchard' })),
      message(Message.SelectedDensity({ density: 'Compact' })),
      message(Message.UpdatedBrandSource({ source: '{"custom":true}' })),
      model(model => {
        expect(model.theming.brandSource).toBe('{"custom":true}')
        expect(Option.isNone(model.theming.brandPreset)).toBe(true)
      }),
      message(Message.ClickedBrandPreset({ preset: 'Injection' })),
      Command.expectNone(),
      model(model => {
        expect(model.theming.scope).toEqual({
          mode: 'Dark',
          brand: 'Orchard',
          density: 'Compact',
        })
        expect(model.theming.brandPreset).toEqual(Option.some('Injection'))
        expect(model.theming.brandSource).not.toBe('{"custom":true}')
        expect(model.playground).toEqual(initialModel.playground)
      }),
    )
  })
})
