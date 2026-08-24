import { Effect, Schema } from "effect"
import { LoroDoc, LoroMap } from "loro-crdt"

import { CrdtContainerNotFoundError } from "./errors.js"

export const makeOptionalScalarEditOperations =
  <P extends string>(id: P) =>
  <T>({
    ValueSchema,
    getParentContainer,
    keyInParentContainer,
    encodeValue,
  }: {
    ValueSchema: Schema.Schema<T>
    getParentContainer: (document: LoroDoc) => Effect.Effect<LoroMap, CrdtContainerNotFoundError>
    keyInParentContainer: string
    /** Use when the value isn't supported by Loro containers */
    encodeValue?: (value: T) => Effect.Effect<unknown, Schema.SchemaError>
  }) => {
    const SetPayload = Schema.TaggedStruct(`Set${id}`, {
      value: ValueSchema,
    })

    const UnsetPayload = Schema.TaggedStruct(`Unset${id}`, {})

    return [
      {
        message: SetPayload,
        handler: Effect.fn(SetPayload.fields._tag.schema.literal)(function* (
          document: LoroDoc,
          payload: typeof SetPayload.Type,
        ) {
          const parent = yield* getParentContainer(document)
          const encoded = yield* (encodeValue ?? Effect.succeed)(payload.value)
          parent.set(keyInParentContainer, encoded)
        }),
      },
      {
        message: UnsetPayload,
        handler: Effect.fn(UnsetPayload.fields._tag.schema.literal)(function* (
          document: LoroDoc,
          _payload: typeof UnsetPayload.Type,
        ) {
          const parent = yield* getParentContainer(document)
          parent.delete(keyInParentContainer)
        }),
      },
    ] as const
  }
