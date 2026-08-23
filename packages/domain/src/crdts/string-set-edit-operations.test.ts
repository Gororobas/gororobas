import { describe, it } from "@effect/vitest"
import { Array as EffectArray, Effect, HashSet, Record, Schema } from "effect"
import { FastCheck } from "effect/testing"
import { LoroDoc } from "loro-crdt"

import { Locale } from "../common/enums.js"
import { assertPropertyEffect } from "../testing.js"
import { makeStringSetEditOperations } from "./string-set-edit-operations.js"

const containerName = "locales"

const { added, removed } = makeStringSetEditOperations("Locale")({
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

const addedMessageArbitrary = Schema.toArbitrary(added.message)(FastCheck)
const removedMessageArbitrary = Schema.toArbitrary(removed.message)(FastCheck)

// An enum map can have at most one entry per enum value.
const addedMessagesArbitrary = FastCheck.uniqueArray(addedMessageArbitrary, {
  selector: (message) => message.value,
})

const removedMessagesArbitrary = FastCheck.array(removedMessageArbitrary, { maxLength: 100 })

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

const addThenRemoveArbitrary = addedMessagesArbitrary.chain((addedMessages) =>
  FastCheck.subarray(addedMessages.map((message) => message.value)).map((removedValues) => ({
    addedMessages,
    removedMessages: removedValues.map(removeMessage),
  })),
)

describe("generateEnumsMapOperations", () => {
  it.effect("adds every distinct enum value as a map key", () =>
    assertPropertyEffect(addedMessagesArbitrary, (messages) =>
      Effect.sync(() => {
        const document = new LoroDoc()
        Effect.runSync(applyAddedMessages(document, messages))

        const values = getEnumMapJson(document)
        return (
          Record.keys(values).length === messages.length &&
          messages.every((message) => Object.hasOwn(values, message.value))
        )
      }),
    ),
  )

  it.effect("is idempotent when add operations are replayed", () =>
    assertPropertyEffect(addedMessagesArbitrary, (messages) =>
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
    ),
  )

  it.effect("leaves an empty map when only remove operations are applied", () =>
    assertPropertyEffect(removedMessagesArbitrary, (messages) =>
      Effect.sync(() => {
        const document = new LoroDoc()
        Effect.runSync(applyRemovedMessages(document, messages))

        return EffectArray.isArrayEmpty(Record.keys(getEnumMapJson(document)))
      }),
    ),
  )

  it.effect("matches an imperative model when added values are later removed", () =>
    assertPropertyEffect(addThenRemoveArbitrary, ({ addedMessages, removedMessages }) =>
      Effect.sync(() => {
        const document = new LoroDoc()
        const model = new PlainJsStringHashSetModel()

        Effect.runSync(applyAddedMessages(document, addedMessages))
        model.add(addedMessages)
        Effect.runSync(applyRemovedMessages(document, removedMessages))
        model.remove(removedMessages)

        return hasSameEntries(getEnumMapJson(document), model.toJSON())
      }),
    ),
  )
})
