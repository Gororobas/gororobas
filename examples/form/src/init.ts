import { NotValidated } from 'foldkit/fieldValidation'

import { ApplicationComposition } from './composition'
import { type Model, Submission } from './model'

export const initialModel: typeof Model.Type = {
  name: NotValidated({ value: '' }),
  email: NotValidated({ value: '' }),
  messageText: NotValidated({ value: '' }),
  submission: Submission.NotSubmitted(),
}

export const init = ApplicationComposition.makeInit(() => ({
  model: initialModel,
}))
