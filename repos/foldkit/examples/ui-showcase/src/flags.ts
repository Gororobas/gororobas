import { Effect, Schema } from 'effect'
import { Calendar } from 'foldkit'

export const Flags = Schema.Struct({
  today: Calendar.CalendarDate,
})

export const flags = Effect.gen(function* () {
  const today = yield* Calendar.today.local

  return { today }
})
