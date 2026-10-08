import { Effect, Schema } from "effect"
import { LoroDoc, LoroMap } from "loro-crdt"

import { SupportedLanguage } from "../common/enums.js"
import { toLoroValue } from "./loro-values.js"

export const makeOptionalTranslatedScalarEditOperations =
  <P extends string>(id: P) =>
  <D, E>({
    ValueSchema,
    getParentContainer,
    keyInParentContainer,
  }: {
    ValueSchema: Schema.Codec<D, string | number, never, never>
    getParentContainer: (
      document: LoroDoc,
      language: SupportedLanguage,
    ) => Effect.Effect<LoroMap, E>
    keyInParentContainer: string
  }) => {
    const SetPayload = Schema.TaggedStruct(`Set${id}`, {
      language: SupportedLanguage,
      value: ValueSchema,
    })

    const UnsetPayload = Schema.TaggedStruct(`Unset${id}`, { language: SupportedLanguage })

    return [
      {
        message: SetPayload,
        handler: Effect.fn(SetPayload.fields._tag.schema.literal)(function* (
          document: LoroDoc,
          payload: typeof SetPayload.Type,
        ) {
          const parent = yield* getParentContainer(document, payload.language)
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
          const parent = yield* getParentContainer(document, payload.language)
          parent.delete(keyInParentContainer)
        }),
      },
    ] as const
  }
