import {
  EMPTY_LORO_DOC_FRONTIER,
  type EventSourceData,
  HumanCommit,
  IdGen,
  Locale,
  LoroDocFrontier,
  type PostSourceData,
  type PublicationClassification,
  PublicationCommitId,
  PublicationCrdtRow,
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
  Record,
  Schema,
  Predicate,
} from "effect"
import { SqlClient } from "effect/sql"

import {
  persistCrdtDocumentCreation,
  persistCrdtDocumentUpdate,
} from "../common/crdt-aggregate-persistence.js"
import { materializeJunctionTable } from "../common/table-materialization.js"
import {
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
  applyPublicationCrdtUpdateWithCommit,
  createPublicationSnapshot,
  createSystemTranslationCrdtUpdate,
} from "./publication-crdt-orchestration.js"
import {
  HumanCrdtUpdate,
  type CreatePublicationInput as CreatePublicationInputType,
  type UpdatePublicationInput as UpdatePublicationInputType,
} from "./publication-repository-inputs.js"
import {
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
       *    MATERIALIZATION
       * ======================
       */

      const materializePublicationRow = (input: {
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

      const materializeTranslations = (input: {
        locales: PostSourceData["locales"]
        publicationId: PublicationId
      }) => {
        const rows = Record.toEntries({
          en: input.locales.en,
          es: input.locales.es,
          pt: input.locales.pt,
        }).flatMap(([locale, localeData]) => {
          if (!localeData || !Schema.is(Locale)(locale)) return []

          return PublicationTranslationRow.make({
            content: localeData.content,
            contentPlainText: tiptapToText(localeData.content),
            locale,
            originalLocale: localeData.originalLocale,
            publicationId: input.publicationId,
            translatedAtCrdtFrontier: localeData.translatedAtCrdtFrontier,
            translationSource: localeData.translationSource,
          })
        })

        return materializeJunctionTable({
          deleteRows: sql`DELETE FROM publication_translations WHERE publication_id = ${input.publicationId}`,
          insertRows: EffectArray.isReadonlyArrayNonEmpty(rows)
            ? insertPublicationTranslationRows(rows)
            : Effect.void,
        })
      }

      const materializeTags = (input: {
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

        return materializeJunctionTable({
          deleteRows: sql`DELETE FROM publication_tags WHERE publication_id = ${input.publicationId}`,
          insertRows: EffectArray.isReadonlyArrayNonEmpty(rows)
            ? insertPublicationTagRows(rows)
            : Effect.void,
        })
      }

      const materializeWikiArticles = (input: {
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

        return materializeJunctionTable({
          deleteRows: sql`DELETE FROM publication_wiki_articles WHERE publication_id = ${input.publicationId}`,
          insertRows: EffectArray.isReadonlyArrayNonEmpty(rows)
            ? insertPublicationWikiArticleRows(rows)
            : Effect.void,
        })
      }

      const materializePublication = (input: {
        classification?: PublicationClassification
        currentCrdtFrontier: LoroDocFrontier
        publicationId: PublicationId
        sourceData: PublicationSourceData
      }) =>
        Effect.gen(function* () {
          yield* materializePublicationRow({
            currentCrdtFrontier: input.currentCrdtFrontier,
            metadata: input.sourceData.metadata,
            publicationId: input.publicationId,
          })

          yield* materializeTranslations({
            locales: input.sourceData.locales,
            publicationId: input.publicationId,
          })

          yield* materializeTags({
            ...(input.classification
              ? {
                  classification: input.classification,
                }
              : {}),
            publicationId: input.publicationId,
          })

          yield* materializeWikiArticles({
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
          const created = createPublicationSnapshot(input.sourceData)

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
            materialize: materializePublication({
              currentCrdtFrontier: created.currentCrdtFrontier,
              publicationId,
              sourceData: created.sourceData,
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

          const commit = Schema.is(HumanCrdtUpdate)(input)
            ? HumanCommit.make({
                personId: input.authorId,
              })
            : input.commit

          const crdtUpdate = Schema.is(HumanCrdtUpdate)(input)
            ? input.crdtUpdate
            : yield* createSystemTranslationCrdtUpdate({
                commit: input.commit,
                expectedCurrentCrdtFrontier: input.expectedCurrentCrdtFrontier,
                snapshot: current.crdtSnapshot,
                sourceLocale: input.sourceLocale,
                targetLocale: input.targetLocale,
                translatedContent: input.translatedContent,
              })

          const applied = yield* applyPublicationCrdtUpdateWithCommit({
            commit,
            crdtUpdate,
            snapshot: current.crdtSnapshot,
          })

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
            materialize: materializePublication({
              currentCrdtFrontier: applied.nextCrdtFrontier,
              publicationId: input.publicationId,
              sourceData: applied.sourceData,
            }),
          })
        })

      return {
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
