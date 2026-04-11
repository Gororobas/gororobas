import { describe, expect, it } from "@effect/vitest"
import {
  Handle,
  HumanCommit,
  PersonId,
  SourceResourceData,
  TiptapDocument,
  TiptapNode,
} from "@gororobas/domain"
import { Effect, Schema } from "effect"

import {
  createResourceSnapshot,
  evolveResourceSnapshot,
} from "../../src/resources/resource-crdt-orchestration.js"

const makeHandle = (value: string) => Schema.decodeUnknownSync(Handle)(value)

const paragraph = (text: string): TiptapNode => ({
  content: [{ text, type: "text" }],
  type: "paragraph",
})

const makeDocument = (text: string): TiptapDocument => ({
  content: [paragraph(text)],
  type: "doc",
  version: 1,
})

const makePersonId = () =>
  Schema.decodeUnknownSync(PersonId)("01956f35-57e0-7f4e-8aef-9da46f1a20b3")

const makeSourceData = (descriptionText: string): SourceResourceData =>
  SourceResourceData.make({
    locales: {
      pt: {
        title: "Manual de Agroecologia",
        description: makeDocument(descriptionText),
        creditLine: "Comunidade",
        originalLocale: "pt",
        translationSource: "ORIGINAL",
      },
    },
    metadata: {
      format: "BOOK",
      handle: makeHandle("manual-agroecologia"),
      thumbnailImageId: null,
      url: "https://example.com/manual-agroecologia",
      urlState: "UNCHECKED",
    },
  })

describe("loro-mirror playground for resource updates", () => {
  it.effect("small edit produces a compact CRDT update relative to initial creation", () =>
    Effect.gen(function* () {
      const initial = createResourceSnapshot(
        makeSourceData("Texto base com muitas palavras para avaliar a granularidade do diff."),
      )

      const smallEdit = yield* evolveResourceSnapshot({
        commit: HumanCommit.make({ personId: makePersonId() }),
        nextSourceData: makeSourceData(
          "Texto base com muitas palavras para avaliar a granularidade do diff com ajuste mínimo.",
        ),
        snapshot: initial.crdtSnapshot,
      })

      expect(smallEdit.crdtUpdate.byteLength).toBeGreaterThan(0)
      expect(smallEdit.crdtUpdate.byteLength).toBeLessThan(initial.initialCrdtUpdate.byteLength)
      expect(smallEdit.fromCrdtFrontier).toEqual(initial.currentCrdtFrontier)
    }),
  )

  it.effect("larger edit generates a bigger update than a small localized edit", () =>
    Effect.gen(function* () {
      const initial = createResourceSnapshot(makeSourceData("Descrição inicial de referência."))

      const smallEdit = yield* evolveResourceSnapshot({
        commit: HumanCommit.make({ personId: makePersonId() }),
        nextSourceData: makeSourceData("Descrição inicial de referência com ajuste."),
        snapshot: initial.crdtSnapshot,
      })

      const largeEdit = yield* evolveResourceSnapshot({
        commit: HumanCommit.make({ personId: makePersonId() }),
        nextSourceData: makeSourceData(
          "Nova descrição extensa. Inclui mudanças estruturais, mais contexto, novos termos e trechos adicionais para simular uma reescrita completa.",
        ),
        snapshot: initial.crdtSnapshot,
      })

      expect(largeEdit.crdtUpdate.byteLength).toBeGreaterThan(smallEdit.crdtUpdate.byteLength)
      expect(largeEdit.nextFrontier).not.toEqual(initial.currentCrdtFrontier)
    }),
  )
})
