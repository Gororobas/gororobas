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

export type RequiredKeys<Value> = {
  [Key in keyof Value]-?: {} extends Pick<Value, Key> ? never : Key
}[keyof Value]

export type SameMembers<Left, Right> =
  Equal<keyof Left, keyof Right> extends true
    ? {
        [Key in keyof Left]-?: Key extends keyof Right
          ? Equal<Left[Key], Right[Key]>
          : false
      }[keyof Left] extends true
      ? true
      : false
    : false
