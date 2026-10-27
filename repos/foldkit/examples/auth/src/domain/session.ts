import { Schema } from 'effect'

export const Session = Schema.Struct({
  userId: Schema.String,
  email: Schema.String,
  name: Schema.String,
})

export const SessionJsonString = Schema.fromJsonString(
  Schema.toCodecJson(Session),
)
