import { MediaAssetRow, TiptapDocument } from "@gororobas/domain"

export const migrateMediaDescriptions = (label: string | null): MediaAssetRow["descriptions"] =>
  label
    ? {
        pt: TiptapDocument.make({
          type: "doc",
          version: 1,
          content: label.split(/\r\n|\r|\n/).map((text) => ({
            type: "paragraph",
            content: text ? [{ type: "text", text }] : [],
          })),
        }),
      }
    : {}
