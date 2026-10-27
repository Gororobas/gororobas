import { isCallableTaggedStruct } from '../schema/index.js'

/** A callable Message variant accepted by a Block's operations record. */
export type OperationMessageConstructor = Readonly<{
  fields: Readonly<Record<string, unknown>>
  '~type.make.in': unknown
}> &
  ((...args: ReadonlyArray<any>) => Readonly<{ _tag: string }>)

/** @internal Preserves decoded and constructor-default input overloads. */
export type OperationPayload<Constructor extends OperationMessageConstructor> =
  | Constructor['~type.make.in']
  | (Omit<ReturnType<Constructor>, '_tag'> &
      Readonly<{ _tag?: ReturnType<Constructor>['_tag'] }>)

/** @internal Empty variants contribute no placeholder before dispatch Context. */
export type OperationParameters<
  Constructor extends OperationMessageConstructor,
> =
  Exclude<keyof Constructor['fields'], '_tag'> extends never
    ? readonly []
    : readonly [payload: OperationPayload<Constructor>]

/** @internal Distinguishes actual Message constructors from tuple producers. */
export const isOperationMessageConstructor = (
  value: unknown,
): value is OperationMessageConstructor => isCallableTaggedStruct(value)

/** @internal Prepares invocation arguments without constructing a Message. */
export const prepareOperation = (Message: OperationMessageConstructor) => {
  const hasPayload = Reflect.ownKeys(Message.fields).some(
    name => name !== '_tag',
  )

  return (...args: ReadonlyArray<unknown>): ReadonlyArray<unknown> => {
    if (hasPayload) {
      const [payload, ...context] = args

      return [Reflect.apply(Message, undefined, [payload]), ...context]
    } else {
      return [Reflect.apply(Message, undefined, []), ...args]
    }
  }
}
