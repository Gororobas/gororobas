import { Context, Effect } from "effect"

import { insertRow } from "./mutations.js"
import { findAll, findByHandle, findById, findByName } from "./queries.js"

export class TagsRepository extends Context.Service<TagsRepository>()("TagsRepository", {
  make: Effect.succeed({
    findById,
    findByHandle,
    findByName,
    findAll,
    insertRow,
  } as const),
}) {}
