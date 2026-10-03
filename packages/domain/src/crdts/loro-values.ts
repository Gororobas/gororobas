import { Predicate, Record, type Schema } from "effect"
import type { Value } from "loro-crdt"

// Match Loro's UTF-8 conversion: replace isolated UTF-16 surrogates, preserving paired emoji.
export const toLoroString = (value: string): string => value.replace(/[\uD800-\uDFFF]/gu, "\uFFFD")

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray => Array.isArray(value)
const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !isJsonArray(value)

export const toLoroValue = (value: Schema.Json): Schema.Json & Value => {
  if (typeof value === "string") return toLoroString(value)
  if (isJsonArray(value)) return value.map(toLoroValue)
  if (isJsonObject(value))
    return Record.fromEntries(
      Record.toEntries(value).map(([key, entry]) => [toLoroString(key), toLoroValue(entry)]),
    )
  return value
}
