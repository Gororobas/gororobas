import { DateTime, Effect } from "effect"

export const nowAsIso = Effect.gen(function* () {
  const now = yield* DateTime.now
  return DateTime.formatIso(now)
})
