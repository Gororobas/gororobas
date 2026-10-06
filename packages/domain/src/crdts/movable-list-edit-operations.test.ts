import { describe, it } from "@effect/vitest"
import { Effect, Match, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { LoroDoc } from "loro-crdt"

import { ValidName } from "../common/primitives.js"
import { assertPropertyEffect } from "../testing.js"
import { makeMovableListEditOperations } from "./movable-list-edit-operations.js"

const ListValue = ValidName

const [added, removed, updated, moved] = makeMovableListEditOperations("Item")({
  ValueSchema: ListValue,
  getContainer: (currentDocument) => Effect.succeed(currentDocument.getMovableList("items")),
})

const ListOperation = Schema.Union([added.message, removed.message, updated.message, moved.message])

const listOperationsArbitrary = Arbitrary.array(Arbitrary.schema(ListOperation), {
  maxLength: 100,
})

describe("makeMovableListEditOperations", () => {
  it.effect("ensure it runs", () =>
    assertPropertyEffect({
      arbitrary: listOperationsArbitrary,
      predicate: (operations) =>
        Effect.gen(function* () {
          const document = new LoroDoc()

          yield* Effect.forEach(
            operations,
            (operation) =>
              Match.value(operation).pipe(
                Match.tagsExhaustive({
                  AddedItem: (op) => added.handler(document, op),
                  RemovedItem: (op) => removed.handler(document, op),
                  UpdatedItem: (op) => updated.handler(document, op),
                  MovedItem: (op) => moved.handler(document, op),
                }),
              ),
            { concurrency: 1 },
          ).pipe(
            Effect.tapErrorTag("SchemaError", (e) => Effect.logError("AQUI", e.message)),
            // As the arbitrary is not constrained by events that come before, it'll generate a bunch of invalid
            // ids that will throw CrdtListItemNotFoundError. We catch it and return undefined to avoid failing the test.
            // @todo constrain the event arbitraries
            Effect.catchTag("CrdtListItemNotFoundError", () => Effect.succeed(undefined)),
          )

          return true
        }),
    }),
  )
})
