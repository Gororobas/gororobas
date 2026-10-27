import { css, type CssAttribute, type Part } from "@pleat/foldkit"
import { Array as EffectArray, Record, Schema } from "effect"
import { inertHtml, type Attribute, type ChildAttribute } from "foldkit/html"

const classAttribute = Schema.TaggedStruct("Class", { value: Schema.String })
const styleAttribute = Schema.TaggedStruct("Style", {
  value: Schema.Record(Schema.String, Schema.String),
})
const isClassAttribute = Schema.is(classAttribute)
const isStyleAttribute = Schema.is(styleAttribute)

const declarationName = (name: string): string =>
  name.startsWith("--")
    ? name
    : name === "cssFloat"
      ? "float"
      : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^ms-/, "-ms-")

/** Merges Pleat styles into attributes that may already carry a `Class` or `Style`, such as
 *  ones a caller or `@foldkit/ui` passed in. Foldkit keeps only the last `Class` and `Style`
 *  an element gets, so spreading `css()` next to them would drop one side. The attribute type
 *  is kept, so element-specific attribute lists such as a textarea's stay assignable. */
export const styledAttributes = <Message, A extends object = Attribute<Message> | ChildAttribute>(
  attributes: ReadonlyArray<A>,
  ...parts: ReadonlyArray<Part>
): ReadonlyArray<A | CssAttribute> => {
  const remaining: globalThis.Array<A> = []
  const classes: globalThis.Array<string> = []
  const styles: Record<string, string> = {}

  // oxlint-disable-next-line effect/no-unknown-parameters -- Schema.is guards narrow Foldkit attributes, including ones nested in ChildAttribute wrappers.
  const collect = (value: unknown): boolean => {
    if (isClassAttribute(value)) {
      classes.push(value.value)
      return true
    }

    if (isStyleAttribute(value)) {
      Object.assign(
        styles,
        Record.fromEntries(
          Record.toEntries(value.value).map(([name, content]) => [declarationName(name), content]),
        ),
      )

      return true
    }

    return false
  }

  EffectArray.forEach(attributes, (attribute) => {
    if (!collect("attribute" in attribute ? attribute.attribute : attribute)) {
      remaining.push(attribute)
    }
  })

  EffectArray.forEach(css(...parts), collect)

  return [
    ...remaining,
    ...EffectArray.match(classes, {
      onEmpty: () => [],
      onNonEmpty: (values) => [inertHtml.Class(values.join(" "))],
    }),
    ...EffectArray.match(Record.keys(styles), {
      onEmpty: () => [],
      onNonEmpty: () => [inertHtml.Style(styles)],
    }),
  ]
}
