/** Mix flat text with nested blockquotes/lists without including fixture construction in benchmark timings. */
import type { TiptapDocument } from "../../src/rich-text/domain.js"

export const largeTiptapDocument = (paragraphCount: number) => {
  const paragraphs = Array.from({ length: paragraphCount }, (_, index) => ({
    type: "paragraph" as const,
    content: [
      {
        type: "text" as const,
        text: `Paragraph ${index}: agroecology `,
        marks: [{ type: "bold" as const }],
      },
      {
        type: "entityReference" as const,
        attrs: {
          version: 1 as const,
          referenceType: "PROFILE" as const,
          referenceId: "019a0dce-1fc0-7abc-8abc-123456789abc",
          labelAtInsertion: "An Araza",
        },
      },
      { type: "hardBreak" as const },
      { type: "text" as const, text: "Growing together." },
    ],
  }))

  return {
    type: "doc" as const,
    version: 1 as const,
    content: paragraphs.map((paragraph, index) =>
      index % 100 === 0
        ? {
            type: "blockquote" as const,
            content: [
              {
                type: "bulletList" as const,
                content: [{ type: "listItem" as const, content: [paragraph] }],
              },
            ],
          }
        : paragraph,
    ),
  } satisfies typeof TiptapDocument.Encoded
}
