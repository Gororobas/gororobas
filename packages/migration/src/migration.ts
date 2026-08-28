import { Effect } from "effect"
import { Command } from "effect/unstable/cli"

import { sourceGelUsers } from "./users/source-gel-users.js"
import { sourceGelVegetables } from "./vegetables/source-gel-vegetables.js"

export const migrate = Command.make("migrate", {}, () =>
  Effect.gen(function* () {
    yield* sourceGelUsers
    yield* sourceGelVegetables
  }),
).pipe(Command.withDescription("Migrate data from Gel"))
