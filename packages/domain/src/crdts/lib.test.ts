import { expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { LoroDoc } from "loro-crdt"

import { assertPropertyEffect } from "../testing.js"
import { loroDocToUpdate, parseCrdtUpdate } from "./lib.js"

it.effect("reports projection exceptions in the typed CRDT validation channel", () =>
  assertPropertyEffect({
    arbitrary: Arbitrary.schema(Schema.String),
    predicate: (message) =>
      Effect.gen(function* () {
        const document = new LoroDoc()
        document.getMap("attributes").set("value", "initial")

        const error = yield* Effect.flip(
          parseCrdtUpdate({
            sourceDocument: document,
            crdtUpdate: loroDocToUpdate(document),
            targetSchema: Schema.Struct({ value: Schema.String }),
            projectDocument: () => {
              // oxlint-disable-next-line effect/throw-in-effect-gen -- This synchronous projection callback deliberately throws to verify that the CRDT adapter captures external exceptions.
              throw new Error(message)
            },
          }),
        )

        expect(error.reason).toBe("SchemaValidation")
        return true
      }),
  }),
)
