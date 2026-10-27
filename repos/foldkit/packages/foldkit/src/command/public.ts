declare const HandlerTypeId: unique symbol

type Invariant<Value> = (value: Value) => Value

/**
 * The service required by a Command whose implementation is supplied by a
 * Layer. Its name, decoded arguments, and declared result Message identify the
 * handler contract.
 */
export interface Handler<Name extends string, Args, Message> {
  readonly [HandlerTypeId]: Readonly<{
    name: Invariant<Name>
    args: Invariant<Args>
    message: Invariant<Message>
  }>
}

export type {
  Command,
  CommandDefinition,
  CommandDefinitionNoArgs,
  CommandDefinitionWithArgs,
  HandlerOf,
  InterruptOption,
  LayeredCommandDefinitionNoArgs,
  LayeredCommandDefinitionWithArgs,
  ToLayer,
} from './index.js'
export {
  CommandDefinitionTypeId,
  define,
  mapEffect,
  mapMessage,
  mapMessages,
} from './index.js'
export type {
  DefinitionNoArgs,
  DefinitionWithArgs,
  DefinitionWithArgsNameKeyed,
} from './interruptible/index.js'
export * as Interruptible from './interruptible/public.js'
