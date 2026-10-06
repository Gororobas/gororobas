import { Context, Effect } from "effect"

import { insertRow, updateRow } from "./mutations.js"
import { findById } from "./queries.js"

export class PeopleRepository extends Context.Service<PeopleRepository>()("PeopleRepository", {
  make: Effect.succeed({ findById, updateRow, insertRow } as const),
}) {}
