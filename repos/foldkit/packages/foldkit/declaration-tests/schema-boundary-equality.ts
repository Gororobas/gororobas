import type { Schema } from 'effect'
export type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <
        Value,
      >() => Value extends Left ? 1 : 2
      ? true
      : false
    : false
export type Assert<Value extends true> = Value
export type Channels<Codec extends Schema.Top> = readonly [
  Codec['Type'],
  Codec['Encoded'],
  Codec['DecodingServices'],
  Codec['EncodingServices'],
]
