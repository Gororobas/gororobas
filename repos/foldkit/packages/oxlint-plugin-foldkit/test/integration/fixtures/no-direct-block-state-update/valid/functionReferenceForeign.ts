import { modifyFields } from 'foldkit/struct'

import type * as Child from './functionReferenceChild'

export const revealErrors = (child: Child.Model): Child.Model =>
  modifyFields(child, { theme: () => 'Error' })
