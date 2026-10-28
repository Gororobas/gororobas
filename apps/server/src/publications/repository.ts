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
  PublicationCommitId,
  PublicationSourceRow,
  PublicationCrdt,
  PublicationConcurrentUpdateError,
  StalePublicationTranslationError,
  PublicationId,
  PublicationNotFoundError,
  PublicationTranslationRow,
  type PublicationSourceData,
  type PublicationVisibility,
  entityReferenceLinks,
  tiptapToText,
  toSearchableText,
} from "@gororobas/domain"
import { Array as EffectArray, Context, DateTime, Effect, Equal, Option, Schema } from "effect"
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
  insertPublicationSourceRow,
  insertPublicationTranslationRows,
  replacePublicationWikiArticleLinks,
  updatePublicationSourceRow,
  updatePublicationSourceVisibility,
  upsertPublicationProjectionRow,
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
            yield* upsertPublicationProjectionRow({
              ...input.metadata,
              createdAt: now,
              currentCrdtFrontier: input.currentCrdtFrontier,
              id: input.publicationId,
              updatedAt: now,
            })

            return
          }

          yield* upsertPublicationProjectionRow({
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
        const rows = projectContentTranslations(input.sourceData).map((translation) => {
          const contentPlainText = tiptapToText(translation.content)

          return PublicationTranslationRow.make({
            ...translation,
            contentPlainText,
            searchableContent: toSearchableText(contentPlainText),
            publicationId: input.publicationId,
          })
        })

        return persistProjectionJunctionTables({
          deleteRows: sql`DELETE FROM publication_translations WHERE publication_id = ${input.publicationId}`,
          insertRows: EffectArray.isReadonlyArrayNonEmpty(rows)
            ? insertPublicationTranslationRows(rows)
            : Effect.void,
        })
      }

      /** Links from `entityReference` nodes; the source content is the only one people write. */
      const persistEntityReferenceLinks = (input: {
        sourceData: SourceContent
        publicationId: PublicationId
      }) =>
        replacePublicationWikiArticleLinks({
          publicationId: input.publicationId,
          source: "ENTITY_REFERENCE",
          rows: entityReferenceLinks([
            { path: ["sourceContent"], content: input.sourceData.sourceContent },
          ]).map((link) => ({
            publicationId: input.publicationId,
            wikiArticleId: link.wikiArticleId,
            source: "ENTITY_REFERENCE",
            evidence: link.evidence,
          })),
        })

      const persistPublicationProjection = (input: {
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

          yield* persistEntityReferenceLinks({
            sourceData: input.sourceData,
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
            insertCrdt: insertPublicationSourceRow(
              PublicationSourceRow.make({
                linkInference: null,
                createdAt: now,
                crdtSnapshot: created.crdtSnapshot,
                handle: input.handle,
                id: publicationId,
                moderationStatus: "APPROVED_BY_DEFAULT",
                ownerProfileId: input.ownerProfileId,
                publishedAt: input.publishedAt,
                updatedAt: now,
                visibility: input.visibility,
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

          // A human update was built against the frontier its author saw. A system edit (translation)
          // conflicts only if its source changed, which the staleness check below decides.
          if (
            Schema.is(HumanCrdtUpdate)(input) &&
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
              return yield* new StalePublicationTranslationError({ id: input.publicationId })
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

          const commitId = yield* IdGen.make(PublicationCommitId)
          const now = yield* DateTime.now

          yield* persistCrdtDocumentUpdate({
            updateCrdtRow: updatePublicationSourceRow({
              crdtSnapshot: applied.nextSnapshot,
              expectedCrdtFrontier: publicationRow.currentCrdtFrontier,
              id: input.publicationId,
              updatedAt: now,
            }).pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () =>
                    Effect.fail(new PublicationConcurrentUpdateError({ id: input.publicationId })),
                  onSome: () => Effect.void,
                }),
              ),
            ),
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
        }).pipe(
          // The snapshot, frontier and staleness checks must see the same state the write replaces.
          sql.withTransaction,
        )

      /** Changes no CRDT data, so it neither moves the frontier nor conflicts with CRDT edits. */
      const updatePublicationVisibility = (input: {
        publicationId: PublicationId
        visibility: PublicationVisibility
      }) =>
        Effect.gen(function* () {
          yield* updatePublicationSourceVisibility({
            id: input.publicationId,
            visibility: input.visibility,
            updatedAt: yield* DateTime.now,
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
        updatePublicationVisibility,
      } as const
    }),
  },
) {}
