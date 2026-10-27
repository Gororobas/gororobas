import { Schema } from 'effect'

import { type TaggedUnion, defineTaggedUnion } from '../schema/index.js'
import { Url } from '../url/index.js'

/** Schema for internal and external browser URL requests. */
export interface UrlRequestSchema extends TaggedUnion<{
  readonly Internal: { readonly url: typeof Url }
  readonly External: { readonly href: typeof Schema.String }
}> {}

/** Union of `Internal` and `External` URL request types. */
export const UrlRequest: UrlRequestSchema = defineTaggedUnion({
  Internal: { url: Url },
  External: { href: Schema.String },
})
/** Union of `Internal` and `External` URL request types. */
export type UrlRequest = typeof UrlRequest.Type
