declare const model: typeof Model.Type
declare const commands: ReadonlyArray<Command<Message>>
declare const optionalCommands: ReadonlyArray<Command<Message>> | undefined
declare const buildCommands: (
  model: typeof Model.Type,
) => ReadonlyArray<Command<Message>>

// ❌ Bad
// A producer that statically creates no Commands omits the field.
const noCommands = { model, commands: [] }

// ✅ Good
const omittedCommands = { model }
const existingCommands = { model, commands }
const computedCommands = { model, commands: buildCommands(model) }

// Code that spreads, concatenates, executes, or asserts on Commands needs an array.
const normalizedCommands = { model, commands: optionalCommands ?? [] }
