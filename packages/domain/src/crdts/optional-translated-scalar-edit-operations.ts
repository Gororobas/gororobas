import { Effect, Schema } from "effect"
import { LoroDoc, LoroMap } from "loro-crdt"

import { Locale } from "../common/enums.js"
import { toLoroValue } from "./loro-values.js"

export const makeOptionalTranslatedScalarEditOperations =
  <P extends string>(id: P) =>
  <D, E>({
    ValueSchema,
    getParentContainer,
    keyInParentContainer,
  }: {
    ValueSchema: Schema.Codec<D, string | number, never, never>
    getParentContainer: (document: LoroDoc, locale: Locale) => Effect.Effect<LoroMap, E>
    keyInParentContainer: string
  }) => {
    const SetPayload = Schema.TaggedStruct(`Set${id}`, {
      locale: Locale,
      value: ValueSchema,
    })

    const UnsetPayload = Schema.TaggedStruct(`Unset${id}`, { locale: Locale })

    return [
      {
        message: SetPayload,
        handler: Effect.fn(SetPayload.fields._tag.schema.literal)(function* (
          document: LoroDoc,
          payload: typeof SetPayload.Type,
        ) {
          const parent = yield* getParentContainer(document, payload.locale)
          const encoded = yield* Schema.encodeEffect(ValueSchema)(payload.value)
          parent.set(keyInParentContainer, toLoroValue(encoded))
        }),
      },
      {
        message: UnsetPayload,
        handler: Effect.fn(UnsetPayload.fields._tag.schema.literal)(function* (
          document: LoroDoc,
          payload: typeof UnsetPayload.Type,
        ) {
          const parent = yield* getParentContainer(document, payload.locale)
          parent.delete(keyInParentContainer)
        }),
      },
    ] as const
  }
