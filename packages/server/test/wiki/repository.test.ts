import { describe, expect, it } from "@effect/vitest"
import {
  Handle,
  LoroDocUpdate,
  NameInCrdtList,
  PersonId,
  snapshotToLoroDoc,
  WikiArticleEditableData,
  type WikiArticleId,
  WikiArticleRevisionId,
} from "@gororobas/domain"
import { Effect, Layer, Option, Schema } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { Mirror } from "loro-mirror"

import { WikiArticlesRepository } from "../../src/wiki/repository.js"
import {
  WikiArticleEditableDataLoro,
  wikiArticleDataToCrdtStorage,
} from "../../src/wiki/wiki-article-crdt.js"
import { makePersonFixture, makeProfileFixture } from "../fixtures.js"
import { insertPersonWithDependencies, TestLayer } from "../test-helpers.js"

const WikiArticlesRepositoryTestLayer = Layer.effect(
  WikiArticlesRepository,
  WikiArticlesRepository.make,
).pipe(Layer.provide(TestLayer))
const TestLayerWithWikiArticlesRepository = Layer.mergeAll(
  TestLayer,
  WikiArticlesRepositoryTestLayer,
)

const makeName = (value: string) => Schema.decodeUnknownSync(NameInCrdtList)({ value })

const makePlantArticle = (input: {
  enNames?: ReadonlyArray<string>
  ptNames: ReadonlyArray<string>
}) =>
  Schema.decodeUnknownSync(WikiArticleEditableData)({
    _tag: "PLANT",
    attributes: {
      developmentCycleMax: null,
      developmentCycleMin: null,
      edibleParts: null,
      heightMax: null,
      heightMin: null,
      lifecycles: null,
      plantingMethods: null,
      scientificNames: null,
      strata: null,
      temperatureMax: null,
      temperatureMin: null,
      usage: null,
    },
    translations: {
      en: input.enNames
        ? {
            commonNames: input.enNames.map(makeName),
            content: null,
            grammaticalGender: null,
          }
        : undefined,
      pt: {
        commonNames: input.ptNames.map(makeName),
        content: null,
        grammaticalGender: null,
      },
    },
  })

const makeWikiArticleUpdate = (input: {
  nextSourceData: WikiArticleEditableData
  snapshot: Parameters<typeof snapshotToLoroDoc>[0]
}) => {
  const currentDoc = snapshotToLoroDoc(input.snapshot)
  const nextDoc = currentDoc.fork()
  const store = new Mirror({ doc: nextDoc, schema: WikiArticleEditableDataLoro })
  store.setState(() => wikiArticleDataToCrdtStorage(input.nextSourceData))
  store.dispose()

  return Schema.decodeUnknownSync(LoroDocUpdate)(
    nextDoc.export({ from: currentDoc.version(), mode: "update" }),
  )
}

const createPerson = Effect.gen(function* () {
  const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
  const profile = yield* makeProfileFixture({ id: person.id })
  yield* insertPersonWithDependencies({ person, profile })
  return person
})

describe("WikiArticlesRepository", () => {
  it.effect("creates an article and reuses one kind-scoped handle across locales", () =>
    Effect.gen(function* () {
      const repository = yield* WikiArticlesRepository
      const sql = yield* SqlClient.SqlClient
      const person = yield* createPerson
      const sourceData = makePlantArticle({ enNames: ["Corn"], ptNames: ["Corn"] })

      const articleId = yield* repository.createWikiArticle({
        createdById: person.id,
        sourceData,
        status: "PUBLISHED",
      })

      const article = Option.getOrThrow(yield* repository.findById(articleId))
      expect(article._tag).toBe("PLANT")
      expect(article.attributes).toEqual(sourceData.attributes)

      const translations = yield* repository.listTranslationRowsByWikiArticleId(articleId)
      expect(translations).toHaveLength(2)

      const handles = yield* repository.listTranslationHandleRowsByWikiArticleId(articleId)
      expect(handles).toHaveLength(2)
      expect(handles.map((row) => row.handle)).toEqual(["corn", "corn"])

      const ownerRows = yield* sql`
        SELECT * FROM wiki_article_handle_owners WHERE wiki_article_id = ${articleId}
      `
      expect(ownerRows).toHaveLength(1)

      const revisionRows = Schema.decodeUnknownSync(
        Schema.Array(Schema.Struct({ id: WikiArticleRevisionId })),
      )(yield* sql`SELECT id FROM wiki_article_revisions WHERE wiki_article_id = ${articleId}`)
      const revision = Option.getOrThrow(
        yield* repository.findRevisionById(
          Option.getOrThrow(Option.fromNullishOr(revisionRows[0])).id,
        ),
      )
      expect(revision.evaluation).toBe("APPROVED")
    }).pipe(Effect.provide(TestLayerWithWikiArticlesRepository)),
  )

  it.effect("uses additional common names when another article owns the preferred handle", () =>
    Effect.gen(function* () {
      const repository = yield* WikiArticlesRepository
      const person = yield* createPerson

      const firstId = yield* repository.createWikiArticle({
        createdById: person.id,
        sourceData: makePlantArticle({ ptNames: ["Milho"] }),
        status: "PUBLISHED",
      })
      const secondId = yield* repository.createWikiArticle({
        createdById: person.id,
        sourceData: makePlantArticle({ ptNames: ["Milho", "Doce"] }),
        status: "PUBLISHED",
      })

      const firstHandles = yield* repository.listTranslationHandleRowsByWikiArticleId(firstId)
      const secondHandles = yield* repository.listTranslationHandleRowsByWikiArticleId(secondId)
      expect(firstHandles[0]?.handle).toBe("milho")
      expect(secondHandles[0]?.handle).toBe("milho-doce")

      const found = yield* repository.findByHandleAndKind({
        handle: Schema.decodeUnknownSync(Handle)("milho-doce"),
        kind: "PLANT",
      })
      expect(Option.getOrThrow(found).id).toBe(secondId)

      const revisionId = yield* submitNameRevision({
        articleId: secondId,
        authorId: person.id,
        nextNames: ["Milho", "Verde"],
        repository,
      })
      yield* repository.evaluateRevision({
        evaluatedById: person.id,
        evaluation: "APPROVED",
        revisionId,
      })
      const stableHandles = yield* repository.listTranslationHandleRowsByWikiArticleId(secondId)
      expect(stableHandles[0]?.handle).toBe("milho-doce")
    }).pipe(Effect.provide(TestLayerWithWikiArticlesRepository)),
  )

  it.effect(
    "keeps rejected revisions out of the canonical article and merges approved revisions",
    () =>
      Effect.gen(function* () {
        const repository = yield* WikiArticlesRepository
        const author = yield* createPerson
        const moderator = yield* createPerson
        const initialSourceData = makePlantArticle({ ptNames: ["Milho"] })
        const articleId = yield* repository.createWikiArticle({
          createdById: author.id,
          sourceData: initialSourceData,
          status: "PUBLISHED",
        })

        const rejectedRevisionId = yield* submitNameRevision({
          articleId,
          authorId: author.id,
          nextNames: ["Milho rejeitado"],
          repository,
        })
        yield* repository.evaluateRevision({
          evaluatedById: moderator.id,
          evaluation: "REJECTED",
          evaluationReason: "Not accepted",
          revisionId: rejectedRevisionId,
        })
        expect(
          (yield* repository.listTranslationRowsByWikiArticleId(articleId))[0]?.commonNames[0]
            ?.value,
        ).toBe("Milho")

        const approvedRevisionId = yield* submitNameRevision({
          articleId,
          authorId: author.id,
          nextNames: ["Milho aprovado"],
          repository,
        })
        yield* repository.evaluateRevision({
          evaluatedById: moderator.id,
          evaluation: "APPROVED",
          revisionId: approvedRevisionId,
        })
        expect(
          (yield* repository.listTranslationRowsByWikiArticleId(articleId))[0]?.commonNames[0]
            ?.value,
        ).toBe("Milho aprovado")
      }).pipe(Effect.provide(TestLayerWithWikiArticlesRepository)),
  )
})

const submitNameRevision = (input: {
  articleId: WikiArticleId
  authorId: PersonId
  nextNames: ReadonlyArray<string>
  repository: typeof WikiArticlesRepository.Service
}) =>
  Effect.gen(function* () {
    const crdt = Option.getOrThrow(yield* input.repository.findCrdtRowById(input.articleId))
    const nextSourceData = makePlantArticle({ ptNames: input.nextNames })
    const crdtUpdate = makeWikiArticleUpdate({
      nextSourceData,
      snapshot: crdt.crdtSnapshot,
    })

    return yield* input.repository.createRevision({
      createdById: input.authorId,
      crdtUpdate,
      wikiArticleId: input.articleId,
    })
  })
