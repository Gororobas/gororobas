import { Context, Effect } from "effect"

import { insertRow, updateRow } from "./mutations.js"
import { countOtherAdministrators, findAccount, findById } from "./queries.js"

/** @effect-expect-leaking SqlClient */
export class PeopleRepository extends Context.Service<PeopleRepository>()("PeopleRepository", {
  make: Effect.succeed({
    countOtherAdministrators,
    findAccount,
    findById,
    updateRow,
    insertRow,
  } as const),
}) {}
