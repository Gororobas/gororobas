import { describe, it } from "@effect/vitest"
import { Array as EffectArray, Effect, HashSet, Record, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { LoroDoc } from "loro-crdt"

import { Locale } from "../common/enums.js"
import { assertPropertyEffect } from "../testing.js"
import { makeStringSetEditOperations } from "./string-set-edit-operations.js"

const containerName = "locales"

const [added, removed] = makeStringSetEditOperations("Locale")({
  ValueSchema: Locale,
  getContainer: (document) => Effect.succeed(document.getMap(containerName)),
})

const MapJson = Schema.Record(Schema.String, Schema.Boolean)
const RootJson = Schema.Record(Schema.String, Schema.Unknown)

const getEnumMapJson = (document: LoroDoc) => {
  const container = Schema.decodeUnknownSync(RootJson)(document.toJSON())[containerName]
  return container === undefined ? {} : Schema.decodeUnknownSync(MapJson)(container)
}

const hasSameEntries = (
  left: Readonly<Record<string, boolean>>,
  right: Readonly<Record<string, boolean>>,
) =>
  Record.keys(left).length === Record.keys(right).length &&
  Record.toEntries(left).every(([key, value]) => right[key] === value)

const addedMessageArbitrary = Arbitrary.schema(added.message)
const removedMessageArbitrary = Arbitrary.schema(removed.message)

// An enum map can have at most one entry per enum value.
const addedMessagesArbitrary = Arbitrary.filter(
  Arbitrary.array(addedMessageArbitrary),
  (messages) => new Set(messages.map((message) => message.value)).size === messages.length,
)

const removedMessagesArbitrary = Arbitrary.array(removedMessageArbitrary, { maxLength: 100 })

const applyAddedMessages = (
  document: LoroDoc,
  messages: ReadonlyArray<typeof added.message.Type>,
) =>
  Effect.forEach(messages, (message) => added.handler(document, message), {
    concurrency: 1,
  })

const applyRemovedMessages = (
  document: LoroDoc,
  messages: ReadonlyArray<typeof removed.message.Type>,
) =>
  Effect.forEach(messages, (message) => removed.handler(document, message), {
    concurrency: 1,
  })

const removeMessage = (value: Locale) =>
  Schema.decodeUnknownSync(removed.message)({ _tag: "RemovedLocale", value })

class PlainJsStringHashSetModel {
  values = HashSet.empty<Locale>()

  add(messages: ReadonlyArray<typeof added.message.Type>) {
    this.values = messages.reduce(
      (values, message) => HashSet.add(values, message.value),
      this.values,
    )
  }

  remove(messages: ReadonlyArray<typeof removed.message.Type>) {
    this.values = messages.reduce(
      (values, message) => HashSet.remove(values, message.value),
      this.values,
    )
  }

  toJSON() {
    return Record.fromEntries(
      EffectArray.map(EffectArray.fromIterable(this.values), (value) => [value, true] as const),
    )
  }
}

const addThenRemoveArbitrary = Arbitrary.flatMap(addedMessagesArbitrary, (addedMessages) =>
  Arbitrary.map(
    Arbitrary.array(Arbitrary.schema(Locale), { maxLength: addedMessages.length }),
    (removedValues) => ({
      addedMessages,
      removedMessages: removedValues.map(removeMessage),
    }),
  ),
)

describe("generateEnumsMapOperations", () => {
  it.effect("adds every distinct enum value as a map key", () =>
    assertPropertyEffect({
      arbitrary: addedMessagesArbitrary,
      predicate: (messages) =>
        Effect.sync(() => {
          const document = new LoroDoc()
          Effect.runSync(applyAddedMessages(document, messages))

          const values = getEnumMapJson(document)
          return (
            Record.keys(values).length === messages.length &&
            messages.every((message) => Object.hasOwn(values, message.value))
          )
        }),
    }),
  )

  it.effect("is idempotent when add operations are replayed", () =>
    assertPropertyEffect({
      arbitrary: addedMessagesArbitrary,
      predicate: (messages) =>
        Effect.sync(() => {
          const document = new LoroDoc()
          Effect.runSync(applyAddedMessages(document, messages))
          const once = getEnumMapJson(document)

          Effect.runSync(applyAddedMessages(document, messages))
          const twice = getEnumMapJson(document)

          Effect.runSync(applyAddedMessages(document, messages))
          const threeTimes = getEnumMapJson(document)

          return hasSameEntries(once, twice) && hasSameEntries(twice, threeTimes)
        }),
    }),
  )

  it.effect("leaves an empty map when only remove operations are applied", () =>
    assertPropertyEffect({
      arbitrary: removedMessagesArbitrary,
      predicate: (messages) =>
        Effect.sync(() => {
          const document = new LoroDoc()
          Effect.runSync(applyRemovedMessages(document, messages))

          return EffectArray.isArrayEmpty(Record.keys(getEnumMapJson(document)))
        }),
    }),
  )

  it.effect("matches an imperative model when added values are later removed", () =>
    assertPropertyEffect({
      arbitrary: addThenRemoveArbitrary,
      predicate: ({ addedMessages, removedMessages }) =>
        Effect.sync(() => {
          const document = new LoroDoc()
          const model = new PlainJsStringHashSetModel()

          Effect.runSync(applyAddedMessages(document, addedMessages))
          model.add(addedMessages)
          Effect.runSync(applyRemovedMessages(document, removedMessages))
          model.remove(removedMessages)

          return hasSameEntries(getEnumMapJson(document), model.toJSON())
        }),
    }),
  )
})
