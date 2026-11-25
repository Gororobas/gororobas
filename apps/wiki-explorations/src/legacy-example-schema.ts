import { Array as EffectArray, Predicate, Record, Schema } from "effect"

const encodeLiteral = Schema.encodeSync(Schema.fromJsonString(Schema.Json))

function renderLiteralSchema(value: Schema.Json, depth: number): string {
  const indent = "  ".repeat(depth)
  const nested = "  ".repeat(depth + 1)
  if (value === null) return "Schema.Null"
  if (!Predicate.isObjectKeyword(value)) return `Schema.Literal(${encodeLiteral(value)})`

  if (EffectArray.isArray<Schema.JsonArray | Schema.JsonObject>(value)) {
    return EffectArray.match(value, {
      onEmpty: () => "Schema.Tuple([])",
      onNonEmpty: (items) =>
        `Schema.Tuple([\n${items.map((item) => `${nested}${renderLiteralSchema(item, depth + 1)},`).join("\n")}\n${indent}])`,
    })
  }

  return EffectArray.match(Record.toEntries(value), {
    onEmpty: () => "Schema.Struct({})",
    onNonEmpty: (fields) => {
      const lines = fields.map(([key, item]) => {
        const name = key === "__proto__" ? '["__proto__"]' : encodeLiteral(key)
        return `${nested}${name}: ${renderLiteralSchema(item, depth + 1)},`
      })
      return `Schema.Struct({\n${lines.join("\n")}\n${indent}})`
    },
  })
}

export const legacyExampleSchema = (value: Schema.Json) => renderLiteralSchema(value, 0)
