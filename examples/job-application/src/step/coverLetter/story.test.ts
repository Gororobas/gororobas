import { given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { CoverLetterBlock } from './block'

describe('coverLetter', () => {
  test('UpdatedContent replaces the letter text', () => {
    story(
      CoverLetterBlock.update,
      given(CoverLetterBlock.init().model),
      message(
        CoverLetterBlock.Message.UpdatedContent({
          value: 'I love the Elm Architecture.',
        }),
      ),
      model(model => {
        expect(model.content).toBe('I love the Elm Architecture.')
      }),
    )
  })
})
