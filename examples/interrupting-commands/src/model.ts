import { Schema } from 'effect'

export const UploadStatus = Schema.Literals(['Uploading', 'Done', 'Cancelled'])

export const Upload = Schema.Struct({
  id: Schema.Number,
  fileName: Schema.String,
  sizeMegabytes: Schema.Number,
  status: UploadStatus,
})

export const Model = Schema.Struct({
  uploadId: Schema.Number,
  uploads: Schema.Array(Upload),
})
