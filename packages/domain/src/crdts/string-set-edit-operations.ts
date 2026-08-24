import { Effect, Schema } from "effect"
import { LoroDoc, LoroMap } from "loro-crdt"

import { CrdtContainerNotFoundError } from "./errors.js"

export const makeStringSetEditOperations =
  <P extends string>(id: P) =>
  <T extends string, S extends Schema.String | Schema.Literals<ReadonlyArray<T>>>({
    ValueSchema,
    getContainer,
  }: {
    ValueSchema: S
    getContainer: (document: LoroDoc) => Effect.Effect<LoroMap, CrdtContainerNotFoundError>
  }) => {
    const AddedPayload = Schema.TaggedStruct(`Added${id}`, {
      value: ValueSchema,
    })

    const RemovedPayload = Schema.TaggedStruct(`Removed${id}`, {
      value: ValueSchema,
    })

    return [
      {
        message: AddedPayload,
        handler: Effect.fn(AddedPayload.fields._tag.schema.literal)(function* (
          document: LoroDoc,
          payload: typeof AddedPayload.Type,
        ) {
          const container = yield* getContainer(document)
          // @ts-expect-error @todo find a way to type this
          container.set(payload.value, true)
        }),
      },
      {
        message: RemovedPayload,
        handler: Effect.fn(RemovedPayload.fields._tag.schema.literal)(function* (
          document: LoroDoc,
          payload: typeof RemovedPayload.Type,
        ) {
          const container = yield* getContainer(document)
          // @ts-expect-error @todo find a way to type this
          container.delete(payload.value)
        }),
      },
    ] as const
  }
