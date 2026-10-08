import { Predicate, Record, Schema } from "effect"
import { LoroDoc, LoroMap } from "loro-crdt"

import { TiptapDocument } from "../rich-text/domain.js"
import { initializeLoroRichText } from "../rich-text/loro-prosemirror.js"
import { toLoroString, toLoroValue } from "./loro-values.js"

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !Array.isArray(value)

/** Tagged values stay atomic; ordinary objects and arrays become editable containers. */
const initializeLoroMap = ({
  map,
  values,
  omitNull,
}: {
  map: LoroMap
  values: Schema.JsonObject
  omitNull: boolean
}) => {
  Record.toEntries(values).forEach(([key, value]) => {
    if (omitNull && value === null) return
    const normalizedKey = toLoroString(key)

    if (isJsonObject(value) && value.type === "doc") {
      initializeLoroRichText(
        map.ensureMergeableMap(normalizedKey),
        // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- JSON document values must satisfy the rich-text schema before becoming containers.
        Schema.decodeUnknownSync(TiptapDocument)(value),
      )
    } else if (Array.isArray(value)) {
      const list = map.ensureMergeableMovableList(normalizedKey)
      value.forEach((item, index) => list.insert(index, toLoroValue(item)))
    } else if (isJsonObject(value) && !("_tag" in value) && !("type" in value)) {
      initializeLoroMap({ map: map.ensureMergeableMap(normalizedKey), values: value, omitNull })
    } else {
      map.set(normalizedKey, toLoroValue(value))
    }
  })
}

/** Loro roots are maps; scalar roots must be wrapped by the caller's storage codec. */
export function createLoroDocFromData(
  data: Schema.Json,
  options?: { omitNull?: boolean },
): LoroDoc {
  // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- JSON encoders do not express that every root must be an object; validate that constraint here.
  const roots = Schema.decodeUnknownSync(
    Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Json)),
  )(data)
  const document = new LoroDoc()
  document.configDefaultTextStyle({ expand: "after" })

  Record.toEntries(roots).forEach(([key, values]) => {
    const map = document.getMap(toLoroString(key))

    if (values.type === "doc") {
      // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Validate rich-text roots before initializing native containers.
      initializeLoroRichText(map, Schema.decodeUnknownSync(TiptapDocument)(values))
    } else {
      initializeLoroMap({ map, values, omitNull: options?.omitNull ?? false })
    }
  })

  document.commit()
  return document
}
