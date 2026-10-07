import { Context, Effect } from "effect"

import { insertRow, updateRow } from "./mutations.js"
import { countOtherAdministrators, findById } from "./queries.js"

export class PeopleRepository extends Context.Service<PeopleRepository>()("PeopleRepository", {
  make: Effect.succeed({ countOtherAdministrators, findById, updateRow, insertRow } as const),
}) {}
