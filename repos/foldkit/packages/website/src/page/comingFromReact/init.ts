import { Array, Record, pipe } from 'effect'

import { ComingFromReactComposition } from './composition'
import { FAQ_IDS } from './faq'
import type { Model } from './model'

export const init = ComingFromReactComposition.makeInit(() => {
  const disclosures: typeof Model.Type = pipe(
    FAQ_IDS,
    Array.map(id => [id, false] as const),
    Record.fromEntries,
  )

  return { model: disclosures }
})
