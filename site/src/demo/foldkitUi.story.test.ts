import {
  Command,
  given,
  message,
  model,
  story,
} from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { Dialog } from '@foldkit/ui'

import { Message, init, update } from './foldkitUi.ts'

const initialModel = modifyFields(init(), {
  dialog: () => Dialog.init({ id: 'ui-dialog' }),
})

describe('archive dialog', () => {
  test('opens through the child capability, then archives and restores', () => {
    story(
      update,
      given(initialModel),
      message(Message.ClickedArchivePrompt()),
      Command.expectHas(Dialog.ShowDialog),
      Command.resolve(
        Dialog.ShowDialog,
        Dialog.Message.SucceededShowDialog(),
      ),
      model(model => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.isPatternArchived).toBe(false)
      }),
      message(Message.ClickedArchive()),
      Command.expectHas(Dialog.CloseDialog),
      Command.resolve(
        Dialog.CloseDialog,
        Dialog.Message.CompletedCloseDialog(),
      ),
      model(model => {
        expect(model.dialog.isOpen).toBe(false)
        expect(model.isPatternArchived).toBe(true)
      }),
      message(Message.ClickedRestore()),
      Command.expectNone(),
      model(model => {
        expect(model.isPatternArchived).toBe(false)
      }),
    )
  })

  test('a failed dialog acquisition leaves the pattern unarchived', () => {
    story(
      update,
      given(initialModel),
      message(Message.ClickedArchivePrompt()),
      Command.resolve(
        Dialog.ShowDialog,
        Dialog.Message.FailedShowDialog(),
      ),
      Command.expectNone(),
      model(model => {
        expect(model.dialog.isOpen).toBe(false)
        expect(model.isPatternArchived).toBe(false)
      }),
    )
  })
})
