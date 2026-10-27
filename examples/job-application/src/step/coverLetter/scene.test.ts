import { expect, given, label, scene, text, type } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { CoverLetterBlock, view } from './block'

describe('coverLetter', () => {
  test('renders the cover letter field', () => {
    scene(
      { update: CoverLetterBlock.update, view },
      given(CoverLetterBlock.init().model),
      expect(label('Cover Letter')).toExist(),
      expect(text('2000 characters remaining')).toExist(),
    )
  })

  test('typing updates the remaining character count', () => {
    scene(
      { update: CoverLetterBlock.update, view },
      given(CoverLetterBlock.init().model),
      type(label('Cover Letter'), 'Hello'),
      expect(text('1995 characters remaining')).toExist(),
    )
  })
})
