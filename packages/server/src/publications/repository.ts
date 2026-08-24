import {
  EMPTY_LORO_DOC_FRONTIER,
  type EventSourceData,
  Handle,
  HumanCommit,
  IdGen,
  Locale,
  LoroDocFrontier,
  type PostSourceData,
  type PublicationClassification,
  PublicationCommitId,
  PublicationCommitRow,
  PublicationCrdtRow,
  PublicationConcurrentUpdateError,
  PublicationId,
  PublicationNotFoundError,
  PublicationPageData,
  PublicationRow,
  PublicationTagRow,
  PublicationTranslationRow,
  PublicationWikiArticleRow,
  ProfileId,
  type PublicationSourceData,
  tiptapToText,
  ResolvedExistingTagExtraction,
} from "@gororobas/domain"
import { GetPublicationPageParams } from "@gororobas/domain/publications/api"
import {
  Array as EffectArray,
  Context,
  DateTime,
  Effect,
  Equal,
  Option,
  Record,
  Schema,
  Struct,
} from "effect"
import { SqlClient, SqlSchema } from "effect/unstable/sql"

import {
  persistCrdtDocumentCreation,
  persistCrdtDocumentUpdate,
} from "../common/crdt-aggregate-persistence.js"
import { materializeJunctionTable } from "../common/table-materialization.js"
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
       *         READS
       * ======================
       */

      const listPublicationCommitRowsByPublicationIdAsc = SqlSchema.findAll({
        Request: PublicationId,
        Result: PublicationCommitRow,
        execute: (publicationId) =>
          sql`SELECT * FROM publication_commits WHERE publication_id = ${publicationId} ORDER BY created_at ASC`,
      })

      const listPublicationContributorIdsByPublicationId = SqlSchema.findAll({
        Request: PublicationId,
        Result: Schema.Struct({ createdById: Schema.NullOr(ProfileId) }),
        execute: (publicationId) =>
          sql`SELECT DISTINCT created_by_id FROM publication_commits WHERE publication_id = ${publicationId} AND created_by_id IS NOT NULL`,
      })

      const listPublicationRowsByOwnerProfileId = SqlSchema.findAll({
        Request: ProfileId,
        Result: PublicationRow,
        execute: (ownerProfileId) =>
          sql`SELECT * FROM publications WHERE owner_profile_id = ${ownerProfileId} ORDER BY updated_at DESC`,
      })

      const countPublicationRowsByOwnerProfileId = SqlSchema.findOne({
        Request: ProfileId,
        Result: Schema.Struct({ count: Schema.Number }),
        execute: (ownerProfileId) =>
          sql`SELECT COUNT(*) as count FROM publications WHERE owner_profile_id = ${ownerProfileId}`,
      })

      const findPublicationPageData = SqlSchema.findOneOption({
        execute: (req) => sql`
         WITH
         target_publication AS (
             SELECT *
             FROM publications
             WHERE handle = ${req.handle}
             LIMIT 1
         ),
         best_translation AS (
             SELECT
                 pt.publication_id,
                 pt.locale,
                 pt.original_locale,
                 pt.content,
                 ROW_NUMBER() OVER (
                     ORDER BY
                         CASE pt.locale
                             WHEN ${req.locale} THEN 1
                             WHEN 'en' THEN 2
                             WHEN 'pt' THEN 3
                             WHEN 'es' THEN 4
                             ELSE 5
                         END
                 ) AS priority_rank
             FROM publication_translations pt
             INNER JOIN target_publication ON target_publication.id = pt.publication_id
         ),
         aggregated_tags AS (
             SELECT
                 JSON_GROUP_ARRAY(
                     JSON_OBJECT(
                         'tag_id', pt.tag_id,
                         'extraction_text', pt.extraction_text
                     )
                 ) AS tags
             FROM publication_tags pt
             INNER JOIN target_publication ON target_publication.id = pt.publication_id
         ),
         aggregated_wiki_articles AS (
             SELECT
                 JSON_GROUP_ARRAY(
                     JSON_OBJECT(
                         'wiki_article_id', pv.wiki_article_id,
                         'extraction_text', pv.extraction_text
                     )
                 ) AS wiki_articles
             FROM publication_wiki_articles pv
             INNER JOIN target_publication ON target_publication.id = pv.publication_id
         )
         SELECT
             p.id,
             p.current_crdt_frontier,
             p.handle,
             p.visibility,
             p.published_at,
             p.updated_at,
             p.owner_profile_id,
             p.kind,
             p.start_date,
             p.end_date,
             p.location_or_url,
             p.attendance_mode,
             t.locale,
             t.original_locale,
             t.content,
             tags.tags,
             vegs.wiki_articles
         FROM target_publication p
         LEFT JOIN best_translation t ON t.priority_rank = 1
         LEFT JOIN aggregated_tags tags ON TRUE
         LEFT JOIN aggregated_wiki_articles vegs ON TRUE
       `,
        Request: GetPublicationPageParams,
        Result: PublicationPageData,
      })

      const findPublicationRowById = SqlSchema.findOneOption({
        Request: PublicationId,
        Result: PublicationRow,
        execute: (id) => sql`SELECT * FROM publications WHERE id = ${id}`,
      })

      const findPublicationRowByHandle = SqlSchema.findOneOption({
        Request: Handle,
        Result: PublicationRow,
        execute: (handle) => sql`SELECT * FROM publications WHERE handle = ${handle}`,
      })

      const findPublicationCrdtSnapshotById = SqlSchema.findOneOption({
        Request: PublicationId,
        Result: PublicationCrdtRow.mapFields(Struct.pick(["crdtSnapshot"])),
        execute: (id) => sql`SELECT crdt_snapshot FROM publication_crdts WHERE id = ${id}`,
      })

      /**
       * ======================
       *        WRITES
       * ======================
       */

      const deletePublication = SqlSchema.void({
        Request: PublicationId,
        execute: (publicationId) => sql`DELETE FROM publication_crdts WHERE id = ${publicationId}`,
      })

      const insertPublicationCommitRow = SqlSchema.void({
        Request: PublicationCommitRow,
        execute: (row) => sql`INSERT INTO publication_commits ${sql.insert(row)}`,
      })

      const insertPublicationCrdtRow = SqlSchema.void({
        Request: PublicationCrdtRow,
        execute: (row) => sql`INSERT INTO publication_crdts ${sql.insert(row)}`,
      })

      const insertPublicationTranslationRows = SqlSchema.void({
        Request: Schema.Array(PublicationTranslationRow),
        execute: (rows) => sql`INSERT INTO publication_translations ${sql.insert(rows)}`,
      })

      const insertPublicationTagRows = SqlSchema.void({
        Request: Schema.Array(PublicationTagRow),
        execute: (rows) => sql`INSERT INTO publication_tags ${sql.insert(rows)}`,
      })

      const insertPublicationWikiArticleRows = SqlSchema.void({
        Request: Schema.Array(PublicationWikiArticleRow),
        execute: (rows) => sql`INSERT INTO publication_wiki_articles ${sql.insert(rows)}`,
      })

      const updatePublicationCrdtRow = SqlSchema.void({
        Request: PublicationCrdtRow.mapFields(
          Struct.omit(["classification", "createdAt", "ownerProfileId"]),
        ),
        execute: ({ id, ...update }) =>
          sql`UPDATE publication_crdts SET ${sql.update(update)} WHERE id = ${id}`,
      })

      const upsertPublicationRow = SqlSchema.void({
        Request: PublicationRow,
        execute: (row) => sql`
        INSERT INTO publications ${sql.insert(row)}
        ON CONFLICT(id) DO UPDATE SET ${sql.update(row, ["id", "createdAt"])}
      `,
      })

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
          if (wikiArticle._tag !== "ResolvedExistingWikiArticleExtraction") return []

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
            ...(input.classification ? { classification: input.classification } : {}),
            publicationId: input.publicationId,
          })

          yield* materializeWikiArticles({
            ...(input.classification ? { classification: input.classification } : {}),
            publicationId: input.publicationId,
          })
        })

      /**
       * ======================
       *    BUSINESS LOGIC
       *     (PUBLIC API)
       * ======================
       */

      const createPublication = (input: CreatePublicationInputType) =>
        Effect.gen(function* () {
          const publicationId = yield* IdGen.make(PublicationId)
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
                  Effect.fail(new PublicationNotFoundError({ id: input.publicationId })),
                onSome: Effect.succeed,
              }),
            ),
          )
          const publicationRow = yield* findPublicationRowById(input.publicationId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(new PublicationNotFoundError({ id: input.publicationId })),
                onSome: Effect.succeed,
              }),
            ),
          )

          if (
            !Equal.equals(publicationRow.currentCrdtFrontier, input.expectedCurrentCrdtFrontier)
          ) {
            return yield* new PublicationConcurrentUpdateError({ id: input.publicationId })
          }

          const commit = Schema.is(HumanCrdtUpdate)(input)
            ? HumanCommit.make({ personId: input.authorId })
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
