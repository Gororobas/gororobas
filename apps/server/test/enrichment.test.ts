import { describe, expect, it } from "@effect/vitest"
import { ContentLanguage, TiptapNodeId, type TiptapDocument } from "@gororobas/domain"
import { resolveSessionFromAuthSubjectId } from "@gororobas/server/session-service"
import { Effect, Layer, Ref } from "effect"

import { RecordedEnrichment } from "../src/enrichment/enrichment.js"
import { PublicationsRepository } from "../src/publications/repository.js"
import { PublicationsService } from "../src/publications/service.js"
import { WikiArticlesRepository } from "../src/wiki/repository.js"
import { EnrichmentRecorderTestLayer, seedPerson, TestLayer, withSession } from "./test-helpers.js"

const EnrichmentTestEnvironment = Layer.effect(PublicationsService, PublicationsService.make).pipe(
  Layer.provideMerge(EnrichmentRecorderTestLayer),
  Layer.provide(Layer.effect(PublicationsRepository, PublicationsRepository.make)),
  Layer.provide(Layer.effect(WikiArticlesRepository, WikiArticlesRepository.make)),
  Layer.provideMerge(TestLayer),
)

const document = (text: string): TiptapDocument => ({
  type: "doc",
  version: 1,
  content: [
    {
      type: "paragraph",
      attrs: { nodeId: TiptapNodeId.make("paragraph001") },
      content: [{ type: "text", text }],
    },
  ],
})

const createPost = (sourceLanguage?: ContentLanguage) =>
  Effect.gen(function* () {
    const { person } = yield* seedPerson("COMMUNITY")

    const publication = yield* withSession(
      (yield* PublicationsService).createPublication({
        kind: "POST",
        ownerProfileId: person.id,
        content: document("Mutirão de plantio no sábado"),
        visibility: "PUBLIC",
        ...(sourceLanguage === undefined ? {} : { sourceLanguage }),
      }),
      yield* resolveSessionFromAuthSubjectId(person.id),
    )

    return { publication, requested: yield* Ref.get(yield* RecordedEnrichment) }
  })

describe("enrichment", () => {
  it.effect(
    "a new publication requests link inference and translations to the other languages",
    () =>
      Effect.gen(function* () {
        const { publication, requested } = yield* createPost(ContentLanguage.make("pt"))

        expect(requested).toEqual([
          `link inference for publication ${publication.id}`,
          `es translation for publication ${publication.id}`,
          `en translation for publication ${publication.id}`,
        ])
      }).pipe(Effect.provide(EnrichmentTestEnvironment)),
  )

  it.effect("content in an undetermined language is only linked, not translated", () =>
    Effect.gen(function* () {
      const { publication, requested } = yield* createPost()

      expect(requested).toEqual([`link inference for publication ${publication.id}`])
    }).pipe(Effect.provide(EnrichmentTestEnvironment)),
  )
})
