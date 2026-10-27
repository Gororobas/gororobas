import { Array, Effect } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import { BrowserKeyValueStore } from '@effect/platform-browser'

import { EditorBlock } from './commandHostContract'

const DOCUMENT_STORAGE_KEY = 'editor-document'

const SaveDocument = Array.headNonEmpty(EditorBlock.hostHandlers)

const SaveDocumentLayer = SaveDocument.toLayer(
  Effect.gen(function* () {
    const store = yield* KeyValueStore.KeyValueStore

    return ({ contents }) =>
      store.set(DOCUMENT_STORAGE_KEY, contents).pipe(
        Effect.as(EditorBlock.Message.SucceededSaveDocument()),
        Effect.catch(() =>
          Effect.succeed(
            EditorBlock.Message.FailedSaveDocument({
              reason: 'The document could not be saved.',
            }),
          ),
        ),
      )
  }),
)

export const editor = EditorBlock.provideHandlers(SaveDocumentLayer)

const ServicesLayer = BrowserKeyValueStore.layerLocalStorage

export const ApplicationLayer = ServicesLayer
