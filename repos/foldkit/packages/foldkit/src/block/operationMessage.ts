import { Predicate } from 'effect'

/** @internal Keeps constructor defaults and transformations owned by the declared
 * Message Schema, including nested union members and a single callable variant. */
export const makeOperationMessageValidator = (Message: object) => {
  const members = new Set<unknown>([Message])

  for (const member of members) {
    if (!Predicate.isObject(member) && !Predicate.isFunction(member)) {
      continue
    }

    const nested = Reflect.get(member, 'members')

    if (globalThis.Array.isArray(nested)) {
      for (const nestedMember of nested) {
        members.add(nestedMember)
      }
    }
  }

  return (constructor: object): void => {
    if (!members.has(constructor)) {
      throw new Error(
        "[foldkit] A Block operation requires a constructor from this Block's declared Message Schema. A same-shaped constructor from another union is not the same declaration.",
      )
    }
  }
}
