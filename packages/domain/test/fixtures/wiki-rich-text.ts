import { Option, Record, Schema } from "effect"

import { SupportedLanguage } from "../../src/common/enums.js"
import { TiptapNodeId } from "../../src/common/ids.js"
import { TiptapDocument } from "../../src/rich-text/domain.js"
import { WikiArticleEditableData } from "../../src/wiki/wiki-article.js"

/** Editor content always carries node IDs (see `NodeIdExtension`). */
export const wikiRichText = TiptapDocument.make({
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      attrs: { nodeId: TiptapNodeId.make("paragraph001") },
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
