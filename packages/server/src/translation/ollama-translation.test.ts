import { BunServices } from "@effect/platform-bun"
import { describe, expect, it } from "@effect/vitest"
import type { Locale } from "@gororobas/domain"
import { TiptapDocument, type TiptapNode, type TiptapTextNode } from "@gororobas/domain"
import { FileSystem, Path } from "effect"
import { Effect } from "effect"
import { join } from "node:path"

import { translateTiptapContent } from "./translate-tiptap-content.js"
import { TranslationServiceOllama } from "./translation-service-ollama.js"

type TiptapAnyNode = TiptapDocument | TiptapNode | TiptapTextNode

const RESULTS_DIR = join(import.meta.dirname, "translation-results")

const saveTranslationResult = (
  name: string,
  input: TiptapDocument,
  result: { content: TiptapDocument; html: string },
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.makeDirectory(RESULTS_DIR, { recursive: true })

    const filename = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
    yield* fs.writeFileString(
      path.join(RESULTS_DIR, `${filename}.json`),
      JSON.stringify({ input, output: result.content, html: result.html }, null, 2),
    )
  })

/** Recursively collect all text content */
function collectText(node: TiptapAnyNode): string {
  const parts: string[] = []
  if ("text" in node && typeof node.text === "string") {
    parts.push(node.text)
  }
  if ("content" in node && node.content) {
    for (const child of node.content) {
      parts.push(collectText(child as TiptapAnyNode))
    }
  }
  return parts.join("")
}

/** Recursively collect all node types (structural skeleton) */
function collectNodeTypes(node: TiptapAnyNode): string[] {
  const types: string[] = [node.type]
  if ("content" in node && node.content) {
    for (const child of node.content) {
      types.push(...collectNodeTypes(child as TiptapAnyNode))
    }
  }
  return types
}

/** Recursively collect all mark types applied to text nodes */
function collectMarkTypes(node: TiptapAnyNode): string[] {
  const marks: string[] = []
  if ("marks" in node && node.marks) {
    for (const mark of node.marks) {
      marks.push(mark.type)
    }
  }
  if ("content" in node && node.content) {
    for (const child of node.content) {
      marks.push(...collectMarkTypes(child as TiptapAnyNode))
    }
  }
  return marks
}

/** Count content nodes at each level (structural shape) */
function collectContentShape(node: TiptapAnyNode): number[] {
  const shape: number[] = []
  if ("content" in node && node.content) {
    shape.push(node.content.length)
    for (const child of node.content) {
      shape.push(...collectContentShape(child as TiptapAnyNode))
    }
  }
  return shape
}

// ─── Test fixtures ──────────────────────────────────────────────────────────

interface TranslationFixture {
  document: TiptapDocument
  sourceLocale: Locale
  targetLocale: Locale
}

const FIXTURES: Record<string, TranslationFixture> = {
  "simple paragraph (pt→en)": {
    sourceLocale: "pt",
    targetLocale: "en",
    document: TiptapDocument.make({
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "A agroecologia busca integrar saberes tradicionais com práticas sustentáveis de cultivo.",
            },
          ],
        },
      ],
    }),
  },

  "bold and italic marks (pt→en)": {
    sourceLocale: "pt",
    targetLocale: "en",
    document: TiptapDocument.make({
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "O " },
            { type: "text", marks: [{ type: "bold" }], text: "manejo integrado" },
            { type: "text", text: " de pragas é uma abordagem " },
            { type: "text", marks: [{ type: "italic" }], text: "ecológica" },
            { type: "text", text: " e eficiente." },
          ],
        },
      ],
    }),
  },

  "heading + paragraph (es→en)": {
    sourceLocale: "es",
    targetLocale: "en",
    document: TiptapDocument.make({
      type: "doc",
      version: 1,
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Rotación de cultivos" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "La rotación de cultivos mejora la fertilidad del suelo y reduce las plagas.",
            },
          ],
        },
      ],
    }),
  },

  "blockquote (pt→en)": {
    sourceLocale: "pt",
    targetLocale: "en",
    document: TiptapDocument.make({
      type: "doc",
      version: 1,
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "A terra é de quem nela trabalha.",
                },
              ],
            },
          ],
        },
      ],
    }),
  },

  "bullet list (pt→en)": {
    sourceLocale: "pt",
    targetLocale: "en",
    document: TiptapDocument.make({
      type: "doc",
      version: 1,
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Compostagem" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Adubação verde" }] }],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Cobertura morta" }],
                },
              ],
            },
          ],
        },
      ],
    }),
  },

  "ordered list (es→en)": {
    sourceLocale: "es",
    targetLocale: "en",
    document: TiptapDocument.make({
      type: "doc",
      version: 1,
      content: [
        {
          type: "orderedList",
          attrs: { start: 1 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Preparar el suelo" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Sembrar las semillas" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Regar regularmente" }],
                },
              ],
            },
          ],
        },
      ],
    }),
  },

  "link mark preservation (pt→en)": {
    sourceLocale: "pt",
    targetLocale: "en",
    document: TiptapDocument.make({
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Saiba mais sobre " },
            {
              type: "text",
              marks: [
                {
                  type: "link",
                  attrs: {
                    class: "link",
                    href: "https://pt.wikipedia.org/wiki/Agroecologia",
                    rel: "noopener noreferrer nofollow",
                    target: "_blank",
                  },
                },
              ],
              text: "agroecologia",
            },
            { type: "text", text: " na Wikipédia." },
          ],
        },
      ],
    }),
  },

  "image node preservation (pt→en)": {
    sourceLocale: "pt",
    targetLocale: "en",
    document: TiptapDocument.make({
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "A nossa horta comunitária está florescendo.",
            },
          ],
        },
        {
          type: "image",
          attrs: {
            data: '{"image":{"_type":"image","asset":{"_ref":"image-abc123-800x600-jpg","_type":"reference"},"attribution":"users/user123"},"version":1}',
          },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Foto da colheita de ontem." }],
        },
      ],
    }),
  },

  "complex mixed content (pt→en)": {
    sourceLocale: "pt",
    targetLocale: "en",
    document: TiptapDocument.make({
      type: "doc",
      version: 1,
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Diário de cultivo" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hoje plantamos " },
            { type: "text", marks: [{ type: "bold" }], text: "mandioca" },
            { type: "text", text: " e " },
            { type: "text", marks: [{ type: "italic" }], text: "batata-doce" },
            { type: "text", text: "." },
          ],
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Quem planta colhe, quem semeia amor, colhe felicidade.",
                },
              ],
            },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Irrigação por " },
                    {
                      type: "text",
                      marks: [{ type: "bold" }],
                      text: "gotejamento",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Controle biológico de pragas" }],
                },
              ],
            },
          ],
        },
        {
          type: "image",
          attrs: {
            data: '{"image":{"_type":"image","asset":{"_ref":"image-xyz789-1024x768-jpg","_type":"reference"}},"version":1}',
          },
        },
      ],
    }),
  },

  "nested bold inside link (pt→en)": {
    sourceLocale: "pt",
    targetLocale: "en",
    document: TiptapDocument.make({
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Visite o " },
            {
              type: "text",
              marks: [
                {
                  type: "link",
                  attrs: {
                    class: "link",
                    href: "https://example.com/feira",
                    rel: "noopener noreferrer nofollow",
                    target: "_blank",
                  },
                },
                { type: "bold" },
              ],
              text: "mercado orgânico",
            },
            { type: "text", text: " mais próximo." },
          ],
        },
      ],
    }),
  },

  "empty paragraphs preserved (pt→en)": {
    sourceLocale: "pt",
    targetLocale: "en",
    document: TiptapDocument.make({
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Primeiro parágrafo." }],
        },
        { type: "paragraph" },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Terceiro parágrafo." }],
        },
      ],
    }),
  },
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe(
  "ollama translation quality (skipped as it's costly, must be ran manually)",
  { timeout: 180_000, sequential: true },
  () => {
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      it.effect.skip(name, () =>
        Effect.gen(function* () {
          const result = yield* translateTiptapContent({
            content: fixture.document,
            source: fixture.sourceLocale,
            target: fixture.targetLocale,
          })

          yield* saveTranslationResult(name, fixture.document, result)

          const originalText = collectText(fixture.document)
          const translatedText = collectText(result.content)

          // Preserves document node types (structural skeleton)
          expect(collectNodeTypes(result.content)).toEqual(collectNodeTypes(fixture.document))

          // Preserves content shape (node count at each level)
          expect(collectContentShape(result.content)).toEqual(collectContentShape(fixture.document))

          // Preserves mark types
          expect(collectMarkTypes(result.content)).toEqual(collectMarkTypes(fixture.document))

          // Actually translates text (output differs from input)
          if (originalText.trim().length > 0) {
            expect(translatedText).not.toBe(originalText)
            expect(translatedText.trim().length).toBeGreaterThan(0)
          }
        }).pipe(Effect.provide(TranslationServiceOllama), Effect.provide(BunServices.layer)),
      )
    }
  },
)
