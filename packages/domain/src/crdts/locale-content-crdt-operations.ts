import { Effect, Equal, Record, Schema } from "effect"
import { LoroDoc, LoroMap } from "loro-crdt"

import { Locale, TranslationSource } from "../common/enums.js"
import { TiptapDocument } from "../rich-text/domain.js"
import { loroRichTextToTiptap, updateLoroRichText } from "../rich-text/loro-prosemirror.js"
import { LoroDocFrontier } from "./domain.js"
import { CrdtContainerNotFoundError, InvalidCrdtUpdateError } from "./errors.js"
import { toLoroValue } from "./loro-values.js"

type LocaleContentData = {
  readonly content: TiptapDocument
  readonly originalLocale: Locale
  readonly translationSource: TranslationSource
  readonly translatedAtCrdtFrontier: LoroDocFrontier | null
}

export const projectLocaleContentCrdtDocument = (document: LoroDoc) =>
  Record.fromEntries(
    document
      .getMap("locales")
      .entries()
      .map(([locale, value]) => {
        if (!(value instanceof LoroMap)) {
          throw new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
        }
        const content = value.get("content")
        if (!(content instanceof LoroMap)) {
          throw new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
        }
        return [locale, { ...value.toJSON(), content: loroRichTextToTiptap(content) }]
      }),
  )

/** Machine workflows reconcile translation results; frontend bindings edit the native containers directly. */
export const makeLocaleContentCrdtOperations =
  <P extends string>(name: P) =>
  <D extends LocaleContentData>(ValueSchema: Schema.Codec<D, unknown, never, never>) => {
    const SetLocale = Schema.TaggedStruct(`Set${name}Locale`, {
      locale: Locale,
      value: ValueSchema,
    })
    const RemovedLocale = Schema.TaggedStruct(`Removed${name}Locale`, { locale: Locale })
    const SetContent = Schema.TaggedStruct(`Set${name}Content`, {
      locale: Locale,
      content: TiptapDocument,
    })

    return [
      {
        message: SetLocale,
        handler: Effect.fn(function* (document: LoroDoc, payload: typeof SetLocale.Type) {
          const value = yield* Schema.encodeEffect(Schema.toType(ValueSchema))(payload.value)
          const locale = document.getMap("locales").ensureMergeableMap(payload.locale)
          ;(["originalLocale", "translationSource"] as const).forEach((key) => {
            if (locale.get(key) !== value[key]) locale.set(key, value[key])
          })
          const frontier = value.translatedAtCrdtFrontier

          if (!Equal.equals(locale.toJSON().translatedAtCrdtFrontier, frontier)) {
            if (frontier === null) {
              locale.set("translatedAtCrdtFrontier", null)
            } else {
              // A previously original locale has a scalar null in this slot.
              if (locale.get("translatedAtCrdtFrontier") === null) {
                locale.delete("translatedAtCrdtFrontier")
              }
              const list = locale.ensureMergeableMovableList("translatedAtCrdtFrontier")
              if (list.length) list.delete(0, list.length)
              frontier.forEach((entry) => list.push(toLoroValue(entry)))
            }
          }

          updateLoroRichText(locale.ensureMergeableMap("content"), value.content)
        }),
      },
      {
        message: RemovedLocale,
        handler: (document: LoroDoc, payload: typeof RemovedLocale.Type) =>
          Effect.sync(() => {
            document.getMap("locales").delete(payload.locale)
          }),
      },
      {
        message: SetContent,
        handler: Effect.fn(function* (document: LoroDoc, payload: typeof SetContent.Type) {
          const locale = document.getMap("locales").get(payload.locale)
          const content = locale instanceof LoroMap ? locale.get("content") : undefined

          if (!(content instanceof LoroMap)) {
            return yield* new CrdtContainerNotFoundError({
              path: ["locales", payload.locale, "content"],
            })
          }

          updateLoroRichText(content, payload.content)
        }),
      },
    ] as const
  }
