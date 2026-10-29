import { describe, expect, it } from "@effect/vitest"
import {
  ContentLanguage,
  IdGen,
  LoroDocUpdate,
  PublicationCrdt,
  type PersonId,
  type PublicationId,
  PublicationTranslationRow,
  snapshotToLoroDoc,
  tiptapToText,
} from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { SqlClient, SqlSchema } from "effect/sql"
import { WorkflowEngine } from "effect/workflow"

import { textToRichTextDocument } from "../../test/feature-test-helpers.js"
import {
  makePersonFixture,
  makePostPublicationInput,
  makeProfileFixture,
} from "../../test/fixtures.js"
import { insertPersonWithDependencies, TestLayer } from "../../test/test-helpers.js"
import { HumanCrdtUpdate } from "../publications/publication-repository-inputs.js"
import { PublicationsRepository } from "../publications/repository.js"
import {
  PublicationTranslationWorkflow,
  PublicationTranslationWorkflowLayer,
} from "./publication-translation-workflow.js"
import { TranslationService } from "./translation-service.js"

/**
 * What the author does while a translation is in flight. The translator stub performs the edits
 * itself, so they land between reading the source and persisting the translation.
 */
interface TranslationScript {
  editsDuringTranslation: number
  publicationId: PublicationId | undefined
  authorId: PersonId | undefined
  authorEdits: Array<string>
}

const script: TranslationScript = {
  editsDuringTranslation: 0,
  publicationId: undefined,
  authorId: undefined,
  authorEdits: [],
}

const PublicationsLayer = Layer.effect(PublicationsRepository, PublicationsRepository.make).pipe(
  Layer.provideMerge(TestLayer),
)

const editSourceContent = ({
  publicationId,
  authorId,
  text,
}: {
  publicationId: PublicationId
  authorId: PersonId
  text: string
}) =>
  Effect.gen(function* () {
    const repository = yield* PublicationsRepository
    const row = Option.getOrThrow(yield* repository.findPublicationRowById(publicationId))

    const stored = Option.getOrThrow(
      yield* PublicationsRepository.make.pipe(
        Effect.flatMap((repository) => repository.findPublicationCrdtSnapshotById(publicationId)),
      ),
    )

    const current = snapshotToLoroDoc(stored.crdtSnapshot)
    const next = current.fork()

    yield* PublicationCrdt.applyEdit(next, {
      _tag: "SetPublicationSourceContent",
      content: textToRichTextDocument(text),
    })

    yield* repository.updatePublication(
      HumanCrdtUpdate.make({
        authorId,
        publicationId,
        expectedCurrentCrdtFrontier: row.currentCrdtFrontier,
        crdtUpdate: LoroDocUpdate.make(next.export({ mode: "update", from: current.version() })),
      }),
    )
  })

const EditingTranslator = Layer.effect(
  TranslationService,
  Effect.gen(function* () {
    const context = yield* Effect.context<PublicationsRepository | SqlClient.SqlClient | IdGen>()

    return {
      getServiceId: () => "editing-stub",
      translate: ({ targetLanguage }) =>
        Effect.gen(function* () {
          const publicationId = Option.getOrThrow(Option.fromUndefinedOr(script.publicationId))
          const authorId = Option.getOrThrow(Option.fromUndefinedOr(script.authorId))

          yield* Effect.forEach(
            Array.from({ length: script.editsDuringTranslation }, (_, index) => index + 1),
            (edit) => {
              const text = `Edição ${edit} durante a tradução`
              script.authorEdits.push(text)
              return editSourceContent({ publicationId, authorId, text })
            },
            { concurrency: 1, discard: true },
          )

          return `<p>Tradução ${targetLanguage}</p>`
        }).pipe(Effect.provide(context), Effect.orDie),
    }
  }),
)

const WorkflowTestLayer = PublicationTranslationWorkflowLayer.pipe(
  Layer.provideMerge(EditingTranslator),
  Layer.provideMerge(WorkflowEngine.layerMemory),
  Layer.provideMerge(PublicationsLayer),
)

const listTranslations = SqlSchema.findAll({
  Request: Schema.String,
  Result: PublicationTranslationRow,
  execute: (publicationId) =>
    SqlClient.SqlClient.use(
      (sql) => sql`SELECT * FROM publication_translations WHERE publication_id = ${publicationId}`,
    ),
})

const countCommits = SqlSchema.findOne({
  Request: Schema.String,
  Result: Schema.Struct({ count: Schema.Finite }),
  execute: (publicationId) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`SELECT COUNT(*) AS count FROM publication_commits WHERE publication_id = ${publicationId}`,
    ),
})

const createPublication = Effect.gen(function* () {
  const person = yield* makePersonFixture({ accessLevel: "COMMUNITY" })
  yield* insertPersonWithDependencies({
    person,
    profile: yield* makeProfileFixture({ id: person.id }),
  })

  const publicationId = yield* (yield* PublicationsRepository).createPublication({
    createdById: person.id,
    ...makePostPublicationInput({
      content: textToRichTextDocument("Mutirão no sábado"),
      handle: `mutirao-${crypto.randomUUID().slice(0, 8)}`,
      ownerProfileId: person.id,
      publishedAt: yield* DateTime.now,
    }),
  })

  return { publicationId, authorId: person.id }
})

describe("PublicationTranslationWorkflow", () => {
  it.live(
    "stores translations of the current revision, discards them when the author edited meanwhile, and runs once per revision",
    () =>
      assertPropertyEffect({
        arbitrary: Arbitrary.schema(
          Schema.Struct({
            targetLanguage: Schema.Literals(["en", "es"]),
            edits: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 3 })),
          }),
        ),
        options: { runs: 12 },
        predicate: ({ targetLanguage, edits }) =>
          Effect.gen(function* () {
            const repository = yield* PublicationsRepository
            const { publicationId, authorId } = yield* createPublication
            const before = Option.getOrThrow(
              yield* repository.findPublicationRowById(publicationId),
            )

            const stored = Option.getOrThrow(
              yield* PublicationsRepository.make.pipe(
                Effect.flatMap((repository) =>
                  repository.findPublicationCrdtSnapshotById(publicationId),
                ),
              ),
            )

            script.editsDuringTranslation = edits
            script.publicationId = publicationId
            script.authorId = authorId
            script.authorEdits = []

            const payload = {
              publicationId,
              updatedAt: before.updatedAt,
              sourceLanguage: ContentLanguage.make("pt"),
              sourceCrdtFrontier: before.currentCrdtFrontier,
              targetLanguage,
              sourceContent: (yield* PublicationCrdt.read(snapshotToLoroDoc(stored.crdtSnapshot)))
                .sourceContent,
            }

            yield* PublicationTranslationWorkflow.execute(payload)
            const commits = (yield* countCommits(publicationId)).count

            // Re-running the same revision is the durable workflow's idempotency, not a second translation.
            script.editsDuringTranslation = 0
            yield* PublicationTranslationWorkflow.execute(payload)

            const translations = yield* listTranslations(publicationId)
            const original = translations.find((row) => row.translationSource === "ORIGINAL")
            const translated = translations.find((row) => row.language === targetLanguage)

            expect(tiptapToText(Option.getOrThrow(Option.fromUndefinedOr(original)).content)).toBe(
              script.authorEdits.at(-1) ?? "Mutirão no sábado",
            )

            // A translation finished after the author edited is discarded, not stored as current.
            expect(
              translated && {
                translationSource: translated.translationSource,
                translatedAtCrdtFrontier: translated.translatedAtCrdtFrontier,
                text: tiptapToText(translated.content),
              },
            ).toEqual(
              edits > 0
                ? undefined
                : {
                    translationSource: "AUTOMATIC",
                    translatedAtCrdtFrontier: before.currentCrdtFrontier,
                    text: `Tradução ${targetLanguage}`,
                  },
            )

            expect((yield* countCommits(publicationId)).count).toBe(commits)
            return true
          }),
      }).pipe(Effect.provide(WorkflowTestLayer)),
  )
})
