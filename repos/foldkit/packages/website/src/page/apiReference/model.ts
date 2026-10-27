import { Array, Record, Schema, pipe } from 'effect'

import {
  ApiData,
  ApiDataAsyncData,
  SIGNATURE_COLLAPSE_THRESHOLD,
  scopedId,
  signaturesLength,
} from './domain'

export const Disclosures = Schema.Record(Schema.String, Schema.Boolean)

export const Model = Schema.Struct({
  apiData: ApiDataAsyncData.schema,
  disclosures: Disclosures,
})

/** Initial collapsed disclosure state for signatures exceeding the display limit. */
export const disclosuresForApiData = (
  apiData: typeof ApiData.Type,
): typeof Disclosures.Type =>
  pipe(
    apiData.parsedApi.modules,
    Array.flatMap(module =>
      pipe(
        module.functions,
        Array.filter(
          apiFunction =>
            signaturesLength(apiFunction) > SIGNATURE_COLLAPSE_THRESHOLD,
        ),
        Array.map(apiFunction =>
          scopedId('function', module.name, apiFunction.name),
        ),
      ),
    ),
    Record.fromIterableWith(id => [id, false]),
  )
