import { Effect, Schema } from "effect"
import { type LoroDoc } from "loro-crdt"

type MessageSchema = Schema.Schema<unknown>

type EditOperation<Message extends MessageSchema> = {
  readonly message: Message
  handler(document: LoroDoc, payload: Message["Type"]): Effect.Effect<void, unknown, never>
}

type AttributeEdit<Operations> = Operations extends {
  readonly message: infer Message extends MessageSchema
}
  ? Message["Type"]
  : never

const makeOperationRunner = <Message extends MessageSchema>(operation: EditOperation<Message>) => ({
  matches: (change: unknown): change is Message["Type"] => Schema.is(operation.message)(change),
  run: (document: LoroDoc, change: unknown) =>
    Schema.decodeUnknownEffect(operation.message)(change).pipe(
      Effect.flatMap((payload) => operation.handler(document, payload)),
    ),
})

export const defineKindCrdtOperations = <
  const Operations extends readonly EditOperation<MessageSchema>[],
>(
  operations: Operations,
) => {
  const runners = operations.map(makeOperationRunner)
  // oxlint-disable-next-line effect/casting-awareness
  const AttributeEdit = Schema.Union(
    operations.map((operation) => operation.message),
  ) as Schema.Schema<AttributeEdit<Operations[number]>>

  return {
    AttributeEdit,
    applyAttributeEdit: (document: LoroDoc, change: typeof AttributeEdit.Type) => {
      const runner = runners.find((candidate) => candidate.matches(change))

      return runner
        ? runner.run(document, change)
        : Effect.die(`Unknown attribute edit: ${String(change)}`)
    },
  }
}
