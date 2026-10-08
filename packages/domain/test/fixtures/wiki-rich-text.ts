import { Option, Record, Schema } from "effect"

import { SupportedLanguage } from "../../src/common/enums.js"
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
      SupportedLanguage.literals.flatMap((language) => {
        const translation = article.translations[language]

        return translation
          ? [
              [
                language,
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
