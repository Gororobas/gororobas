import {
  projectContentTranslations,
  SourceContent,
  snapshotToLoroDoc,
  EMPTY_LORO_DOC_FRONTIER,
  type EventSourceData,
  HumanCommit,
  IdGen,
  InvalidCrdtUpdateError,
  LoroDocFrontier,
  type PostSourceData,
  type PublicationClassification,
  PublicationCommitId,
  PublicationCrdtRow,
  PublicationCrdt,
  PublicationConcurrentUpdateError,
  PublicationId,
  PublicationNotFoundError,
  PublicationTagRow,
  PublicationTranslationRow,
  PublicationWikiArticleRow,
  type PublicationSourceData,
  tiptapToText,
  ResolvedExistingTagExtraction,
} from "@gororobas/domain"
import {
  Array as EffectArray,
  Context,
  DateTime,
  Effect,
  Equal,
  Option,
  Schema,
  Predicate,
} from "effect"
import { SqlClient } from "effect/sql"

import {
  persistCrdtDocumentCreation,
  persistCrdtDocumentUpdate,
} from "../common/crdt-aggregate-persistence.js"
import { persistProjectionJunctionTables } from "../common/table-projection.js"
import {
  attachMediaToPublication,
  deletePublicationMediaAttachments,
  deletePublication,
  insertPublicationCommitRow,
  insertPublicationCrdtRow,
  insertPublicationTagRows,
  insertPublicationTranslationRows,
  insertPublicationWikiArticleRows,
  updatePublicationCrdtRow,
  upsertPublicationRow,
} from "./mutations.js"
import {
  HumanCrdtUpdate,
  SystemUpsertTranslation,
  type CreatePublicationInput as CreatePublicationInputType,
  type UpdatePublicationInput as UpdatePublicationInputType,
} from "./publication-repository-inputs.js"
import {
  listPublicationMediaAttachments,
  countPublicationRowsByOwnerProfileId,
  findPublicationCrdtSnapshotById,
  findPublicationPageData,
  findPublicationRowByHandle,
  findPublicationRowById,
  listPublicationCommitRowsByPublicationIdAsc,
  listPublicationContributorIdsByPublicationId,
  listPublicationRowsByOwnerProfileId,
} from "./queries.js"

/**
 * Publications repository with CRUD orchestration:
 * - public read queries for the front-end and policy checks
 * - createPublication/updatePublication/deletePublication as the write surface
 */
export class PublicationsRepository extends Context.Service<PublicationsRepository>()(
  "PublicationsRepository",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      /**
       * ======================
       *    PROJECTION PERSISTENCE
       * ======================
       */

      const persistPublicationProjectionRow = (input: {
        currentCrdtFrontier: LoroDocFrontier
        metadata: PostSourceData["metadata"] | EventSourceData["metadata"]
        publicationId: PublicationId
      }) =>
        Effect.gen(function* () {
          const now = yield* DateTime.now

          if (input.metadata.kind === "EVENT") {
            yield* upsertPublicationRow({
              ...input.metadata,
              createdAt: now,
              currentCrdtFrontier: input.currentCrdtFrontier,
              id: input.publicationId,
              updatedAt: now,
            })

            return
          }

          yield* upsertPublicationRow({
            ...input.metadata,
            attendanceMode: null,
            createdAt: now,
            currentCrdtFrontier: input.currentCrdtFrontier,
            endDate: null,
            id: input.publicationId,
            locationOrUrl: null,
            startDate: null,
            updatedAt: now,
          })
        })

      const persistTranslationProjections = (input: {
        sourceData: SourceContent
        publicationId: PublicationId
      }) => {
        const rows = projectContentTranslations(input.sourceData).map((translation) =>
          PublicationTranslationRow.make({
            ...translation,
            contentPlainText: tiptapToText(translation.content),
            publicationId: input.publicationId,
          }),
        )

        return persistProjectionJunctionTables({
          deleteRows: sql`DELETE FROM publication_translations WHERE publication_id = ${input.publicationId}`,
          insertRows: EffectArray.isReadonlyArrayNonEmpty(rows)
            ? insertPublicationTranslationRows(rows)
            : Effect.void,
        })
      }

      const persistTagProjections = (input: {
        classification?: PublicationClassification
        publicationId: PublicationId
      }) => {
        const rows = (input.classification?.tags ?? []).flatMap((tag) => {
          if (!Schema.is(ResolvedExistingTagExtraction)(tag)) return []

          return PublicationTagRow.make({
            extractionText: tag.extractionText,
            publicationId: input.publicationId,
            tagId: tag.tagId,
          })
        })

        return persistProjectionJunctionTables({
          deleteRows: sql`DELETE FROM publication_tags WHERE publication_id = ${input.publicationId}`,
          insertRows: EffectArray.isReadonlyArrayNonEmpty(rows)
            ? insertPublicationTagRows(rows)
            : Effect.void,
        })
      }

      const persistWikiArticleProjections = (input: {
        classification?: PublicationClassification
        publicationId: PublicationId
      }) => {
        const rows = (input.classification?.wikiArticles ?? []).flatMap((wikiArticle) => {
          if (!Predicate.isTagged(wikiArticle, "ResolvedExistingWikiArticleExtraction")) return []

          return PublicationWikiArticleRow.make({
            extractionText: wikiArticle.extractionText,
            publicationId: input.publicationId,
            wikiArticleId: wikiArticle.wikiArticleId,
          })
        })

        return persistProjectionJunctionTables({
          deleteRows: sql`DELETE FROM publication_wiki_articles WHERE publication_id = ${input.publicationId}`,
          insertRows: EffectArray.isReadonlyArrayNonEmpty(rows)
            ? insertPublicationWikiArticleRows(rows)
            : Effect.void,
        })
      }

      const persistPublicationProjection = (input: {
        classification?: PublicationClassification
        currentCrdtFrontier: LoroDocFrontier
        publicationId: PublicationId
        sourceData: PublicationSourceData
      }) =>
        Effect.gen(function* () {
          yield* persistPublicationProjectionRow({
            currentCrdtFrontier: input.currentCrdtFrontier,
            metadata: input.sourceData.metadata,
            publicationId: input.publicationId,
          })

          yield* persistTranslationProjections({
            sourceData: input.sourceData,
            publicationId: input.publicationId,
          })

          yield* persistTagProjections({
            ...(input.classification
              ? {
                  classification: input.classification,
                }
              : {}),
            publicationId: input.publicationId,
          })

          yield* persistWikiArticleProjections({
            ...(input.classification
              ? {
                  classification: input.classification,
                }
              : {}),
            publicationId: input.publicationId,
          })
        })

      /**
       * ======================
       *    BUSINESS LOGIC
       *     (PUBLIC API)
       * ======================
       */

      const createPublication = (
        input: CreatePublicationInputType,
        options: {
          id?: PublicationId
        } = {},
      ) =>
        Effect.gen(function* () {
          const publicationId = options.id ?? (yield* IdGen.make(PublicationId))
          const commitId = yield* IdGen.make(PublicationCommitId)
          const now = yield* DateTime.now
          const created = yield* PublicationCrdt.create(input.sourceData)

          yield* persistCrdtDocumentCreation({
            insertCrdt: insertPublicationCrdtRow(
              PublicationCrdtRow.make({
                classification: null,
                createdAt: now,
                crdtSnapshot: created.crdtSnapshot,
                id: publicationId,
                ownerProfileId: input.sourceData.metadata.ownerProfileId,
                updatedAt: now,
              }),
            ),
            insertCommitOrRevision: insertPublicationCommitRow({
              publicationId,
              id: commitId,
              createdAt: now,
              updatedAt: now,
              createdById: input.createdById,
              crdtUpdate: created.initialCrdtUpdate,
              fromCrdtFrontier: EMPTY_LORO_DOC_FRONTIER,
            }),
            persistProjection: persistPublicationProjection({
              currentCrdtFrontier: created.currentCrdtFrontier,
              publicationId,
              sourceData: created.data,
            }),
          })

          return publicationId
        })

      const updatePublication = (input: UpdatePublicationInputType) =>
        Effect.gen(function* () {
          const current = yield* findPublicationCrdtSnapshotById(input.publicationId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    new PublicationNotFoundError({
                      id: input.publicationId,
                    }),
                  ),
                onSome: Effect.succeed,
              }),
            ),
          )

          const publicationRow = yield* findPublicationRowById(input.publicationId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    new PublicationNotFoundError({
                      id: input.publicationId,
                    }),
                  ),
                onSome: Effect.succeed,
              }),
            ),
          )

          if (
            !Equal.equals(publicationRow.currentCrdtFrontier, input.expectedCurrentCrdtFrontier)
          ) {
            return yield* new PublicationConcurrentUpdateError({
              id: input.publicationId,
            })
          }

          if (Schema.is(SystemUpsertTranslation)(input)) {
            const currentDocument = snapshotToLoroDoc(current.crdtSnapshot)
            const sourceDocument = currentDocument.fork()
            yield* Effect.try({
              try: () => sourceDocument.checkout([...input.sourceCrdtFrontier]),
              catch: () => new InvalidCrdtUpdateError({ reason: "InvalidFormat" }),
            })
            const source = yield* PublicationCrdt.read(sourceDocument)
            const latest = yield* PublicationCrdt.read(currentDocument)

            if (
              source.sourceLanguage !== input.sourceLanguage ||
              latest.sourceLanguage !== source.sourceLanguage ||
              !Equal.equals(latest.sourceContent, source.sourceContent)
            ) {
              return yield* new PublicationConcurrentUpdateError({ id: input.publicationId })
            }
          }

          const commit = Schema.is(HumanCrdtUpdate)(input)
            ? HumanCommit.make({
                personId: input.authorId,
              })
            : input.commit

          const applied = yield* Schema.is(HumanCrdtUpdate)(input)
            ? PublicationCrdt.applyUpdate({
                commit,
                crdtUpdate: input.crdtUpdate,
                snapshot: current.crdtSnapshot,
              })
            : PublicationCrdt.evolve({
                commit,
                snapshot: current.crdtSnapshot,
                edits: [
                  {
                    _tag: "SetPublicationTranslation",
                    language: input.targetLanguage,
                    value: {
                      content: input.translatedContent,
                      originalLanguage: input.sourceLanguage,
                      translatedAtCrdtFrontier: input.sourceCrdtFrontier,
                      translationSource: "AUTOMATIC",
                    },
                  },
                ],
              })

          if (applied.data.metadata.kind !== publicationRow.kind) {
            return yield* new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
          }

          const commitId = yield* IdGen.make(PublicationCommitId)
          const now = yield* DateTime.now

          yield* persistCrdtDocumentUpdate({
            updateCrdtRow: updatePublicationCrdtRow({
              crdtSnapshot: applied.nextSnapshot,
              id: input.publicationId,
              updatedAt: now,
            }),
            insertCommitOrUpdateRevision: insertPublicationCommitRow({
              id: commitId,
              publicationId: input.publicationId,
              createdAt: now,
              updatedAt: now,
              crdtUpdate: applied.crdtUpdate,
              fromCrdtFrontier: applied.fromCrdtFrontier,
              createdById: Schema.is(HumanCommit)(commit) ? commit.personId : null,
            }),
            persistProjection: persistPublicationProjection({
              currentCrdtFrontier: applied.nextCrdtFrontier,
              publicationId: input.publicationId,
              sourceData: applied.data,
            }),
          })
        })

      return {
        listPublicationMediaAttachments,
        attachMediaToPublication,
        deletePublicationMediaAttachments,
        countPublicationRowsByOwnerProfileId,
        createPublication,
        deletePublication,
        findPublicationPageData,
        findPublicationRowByHandle,
        findPublicationRowById,
        listPublicationCommitRowsByPublicationIdAsc,
        listPublicationContributorIdsByPublicationId,
        listPublicationRowsByOwnerProfileId,
        updatePublication,
      } as const
    }),
  },
) {}
