import { Option, Record, Schema } from "effect"

import { Locale } from "../../src/common/enums.js"
import { TiptapDocument } from "../../src/rich-text/domain.js"
import { WikiArticleEditableData } from "../../src/wiki/wiki-article.js"

const wikiRichText = TiptapDocument.make({
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Growing " },
        { type: "text", text: "together", marks: [{ type: "bold" }] },
      ],
    },
  ],
})

/** Use representative editor content for tests that exercise article operations rather than rich-text generation. */
export const withEditorRichText = (article: WikiArticleEditableData): WikiArticleEditableData =>
  Schema.decodeSync(Schema.toType(WikiArticleEditableData))({
    ...article,
    translations: Record.fromEntries(
      Locale.literals.flatMap((locale) => {
        const translation = article.translations[locale]

        return translation
          ? [
              [
                locale,
                {
                  ...translation,
                  content: Option.map(translation.content, () => wikiRichText),
                },
              ],
            ]
          : []
      }),
    ),
  })
