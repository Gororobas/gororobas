import { ContentLanguage, Handle, TiptapDocument } from "@gororobas/domain"
import { DateTime, Effect, Layer, Schema } from "effect"

import { PublicationCommentsRepository } from "../../src/publication-comments/repository.js"
import { PublicationsRepository } from "../../src/publications/repository.js"
import { makePersonFixture, makeProfileFixture } from "../fixtures.js"
import { insertPersonWithDependencies, TestLayer } from "../test-helpers.js"

export const TestLayerWithRepositories = Layer.mergeAll(
  TestLayer,
  Layer.effect(PublicationCommentsRepository, PublicationCommentsRepository.make).pipe(
    Layer.provide(TestLayer),
  ),
  Layer.effect(PublicationsRepository, PublicationsRepository.make).pipe(Layer.provide(TestLayer)),
)

export const makeDocument = (text: string): TiptapDocument =>
  TiptapDocument.make({
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    type: "doc",
    version: 1,
  })

export const fixture = Effect.gen(function* () {
  const publicationComments = yield* PublicationCommentsRepository
  const publications = yield* PublicationsRepository
  const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
  const profile = yield* makeProfileFixture({ id: person.id })
  yield* insertPersonWithDependencies({ person, profile })

  const publicationId = yield* publications.createPublication({
    createdById: person.id,
    sourceData: {
      sourceContent: makeDocument("Publication"),
      sourceLanguage: ContentLanguage.make("pt"),
      translations: { pt: "original" },
      metadata: {
        handle: Schema.decodeSync(Handle)(`publication-comment-${person.id}`),
        kind: "POST",
        ownerProfileId: profile.id,
        publishedAt: yield* DateTime.now,
        visibility: "PUBLIC",
      },
    },
  })

  const publicationCommentId = yield* publicationComments.createPublicationComment({
    createdById: person.id,
    ownerProfileId: profile.id,
    parentPublicationCommentId: null,
    publicationId,
    sourceData: {
      sourceContent: makeDocument("Private original"),
      sourceLanguage: ContentLanguage.make("pt"),
    },
  })

  return { publicationComments, person, publicationCommentId }
})
