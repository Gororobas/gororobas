import { ApplicationComposition } from './composition'
import type { Model } from './model'

export const initialModel: typeof Model.Type = { uploadId: 0, uploads: [] }

export const init = ApplicationComposition.makeInit(() => ({
  model: initialModel,
}))
