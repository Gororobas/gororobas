import { Effect, Predicate, Schema } from "effect"
import { LoroDoc, LoroList, LoroMovableList } from "loro-crdt"

import { LoroListItemId } from "../common/ids.js"
import { ItemInCrdtList } from "../common/primitives.js"
import { CrdtContainerNotFoundError, CrdtListItemNotFoundError } from "./errors.js"
import { createCrdtListItemId } from "./lib.js"

const findItemIndexInCrdtList = (container: LoroMovableList | LoroList, id: LoroListItemId) =>
  Effect.gen(function* () {
    const itemIndex = container
      .toArray()
      .findIndex((item) => Predicate.isObject(item) && "id" in item && item.id === id)

    if (itemIndex < 0) yield* new CrdtListItemNotFoundError({ id: id, list: "@todo" })

    return itemIndex
  })

export const makeMovableListEditOperations =
  <P extends string>(id: P) =>
  <T>({
    ValueSchema,
    getContainer,
  }: {
    ValueSchema: Schema.Codec<T, unknown, never, never>
    getContainer: (document: LoroDoc) => Effect.Effect<LoroMovableList, CrdtContainerNotFoundError>
  }) => {
    const AddedPayload = Schema.TaggedStruct(`Added${id}`, {
      value: ValueSchema,
    })

    const RemovedPayload = Schema.TaggedStruct(`Removed${id}`, {
      id: LoroListItemId,
    })

    const UpdatedPayload = Schema.TaggedStruct(`Updated${id}`, {
      id: LoroListItemId,
      updatedValue: ValueSchema,
    })

    const MovedPayload = Schema.TaggedStruct(`Moved${id}`, {
      id: LoroListItemId,
      newIndex: Schema.Int,
    })

    return [
      {
        message: AddedPayload,
        handler: Effect.fn(AddedPayload.fields._tag.schema.literal)(function* (
          document: LoroDoc,
          payload: typeof AddedPayload.Type,
        ) {
          const container = yield* getContainer(document)
          const encodedValue = yield* Schema.encodeEffect(ValueSchema)(payload.value)
          container.push(
            ItemInCrdtList.make({
              id: createCrdtListItemId(),
              value: encodedValue,
            }),
          )
        }),
      },
      {
        message: RemovedPayload,
        handler: Effect.fn(RemovedPayload.fields._tag.schema.literal)(function* (
          document: LoroDoc,
          payload: typeof RemovedPayload.Type,
        ) {
          const container = yield* getContainer(document)
          const itemIndex = yield* findItemIndexInCrdtList(container, payload.id)
          container.delete(itemIndex, 1)
        }),
      },
      {
        message: UpdatedPayload,
        handler: Effect.fn(UpdatedPayload.fields._tag.schema.literal)(function* (
          document: LoroDoc,
          payload: typeof UpdatedPayload.Type,
        ) {
          const container = yield* getContainer(document)
          const encodedValue = yield* Schema.encodeEffect(ValueSchema)(payload.updatedValue)
          const itemIndex = yield* findItemIndexInCrdtList(container, payload.id)

          container.set(itemIndex, ItemInCrdtList.make({ id: payload.id, value: encodedValue }))
        }),
      },
      {
        message: MovedPayload,
        handler: Effect.fn(MovedPayload.fields._tag.schema.literal)(function* (
          document: LoroDoc,
          payload: typeof MovedPayload.Type,
        ) {
          const container = yield* getContainer(document)
          const itemIndex = yield* findItemIndexInCrdtList(container, payload.id)
          container.move(itemIndex, payload.newIndex)
        }),
      },
    ] as const
  }
