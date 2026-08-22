import {
  EMPTY_LORO_DOC_FRONTIER,
  Handle,
  HumanCommit,
  IdGen,
  Locale,
  LoroDocFrontier,
  loroDocToSnapshot,
  NameInCrdtList,
  tiptapToText,
  WikiArticleCrdtRow,
  WikiArticleEditableData,
  WikiArticleHandleMaterializedRow,
  WikiArticleId,
  WikiArticleKind,
  WikiArticleMaterializedRow,
  WikiArticleNotFoundError,
  WikiArticleRevisionAlreadyEvaluatedError,
  WikiArticleRevisionId,
  WikiArticleRevisionNotFoundError,
  WikiArticleRevisionRow,
  WikiArticleStatus,
  WikiArticleTranslationMaterializedRow,
} from "@gororobas/domain"
import {
  Array as EffectArray,
  Context,
  DateTime,
  Effect,
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
  applyWikiArticleCrdtUpdateWithCommit,
  createWikiArticleSnapshot,
  parseWikiArticleCrdtUpdate,
} from "./wiki-article-crdt.js"
import type {
  CreateWikiArticleInput,
  CreateWikiArticleRevisionInput,
  EvaluateWikiArticleRevisionInput,
} from "./wiki-article-repository-inputs.js"

const WikiArticleDatabaseRow = Schema.Struct({
  attributes: Schema.String,
  createdAt: Schema.DateTimeUtcFromString,
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
  id: WikiArticleId,
  kind: WikiArticleKind,
  status: WikiArticleStatus,
  updatedAt: Schema.DateTimeUtcFromString,
})
type WikiArticleDatabaseRow = typeof WikiArticleDatabaseRow.Type

const WikiArticleHandleOwnerRow = Schema.Struct({
  handle: Handle,
  kind: WikiArticleKind,
  wikiArticleId: WikiArticleId,
})

const WikiArticleTranslationHandleDatabaseRow = Schema.Struct({
  ...WikiArticleHandleMaterializedRow.fields,
})
type WikiArticleTranslationHandleDatabaseRow = typeof WikiArticleTranslationHandleDatabaseRow.Type

const WikiArticleLookup = Schema.Struct({
  handle: Handle,
  kind: WikiArticleKind,
})

const UnknownJsonString = Schema.fromJsonString(Schema.Unknown)

const encodeArticleAttributes = (sourceData: WikiArticleEditableData) =>
  Schema.encodeSync(UnknownJsonString)(
    Schema.encodeSync(WikiArticleEditableData)(sourceData).attributes,
  )

const decodeArticleRow = (row: WikiArticleDatabaseRow) =>
  Schema.decodeUnknownEffect(WikiArticleMaterializedRow)({
    _tag: row.kind,
    attributes: Schema.decodeUnknownSync(UnknownJsonString)(row.attributes),
    createdAt: Schema.encodeSync(Schema.DateTimeUtcFromString)(row.createdAt),
    currentCrdtFrontier: Schema.encodeSync(Schema.fromJsonString(LoroDocFrontier))(
      row.currentCrdtFrontier,
    ),
    id: row.id,
    status: row.status,
    updatedAt: Schema.encodeSync(Schema.DateTimeUtcFromString)(row.updatedAt),
  })

const toHandleCandidate = (names: ReadonlyArray<NameInCrdtList>, count: number) => {
  const normalized = names
    .slice(0, count)
    .map((name) => name.value)
    .join("-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u0023]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30)
    .replace(/-$/g, "")

  return Schema.decodeUnknownOption(Handle)(normalized)
}

const fallbackHandle = (input: {
  names: ReadonlyArray<NameInCrdtList>
  wikiArticleId: WikiArticleId
}) => {
  const suffix = input.wikiArticleId.replaceAll("-", "").slice(0, 8)
  const preferred = Option.getOrElse(toHandleCandidate(input.names, 1), () => Handle.make("wiki"))
  const prefix = preferred.slice(0, 21).replace(/-$/g, "")
  return Handle.make(`${prefix}-${suffix}`)
}

export class WikiArticlesRepository extends Context.Service<WikiArticlesRepository>()(
  "WikiArticlesRepository",
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient

      const findDatabaseRowById = SqlSchema.findOneOption({
        Request: WikiArticleId,
        Result: WikiArticleDatabaseRow,
        execute: (id) => sql`SELECT * FROM wiki_articles WHERE id = ${id}`,
      })

      const findDatabaseRowByHandleAndKind = SqlSchema.findOneOption({
        Request: WikiArticleLookup,
        Result: WikiArticleDatabaseRow,
        execute: ({ handle, kind }) => sql`
          SELECT article.*
          FROM wiki_articles AS article
          INNER JOIN wiki_article_handle_owners AS owner
            ON owner.wiki_article_id = article.id
          WHERE owner.kind = ${kind} AND owner.handle = ${handle}
        `,
      })

      const listDatabaseRows = SqlSchema.findAll({
        Request: Schema.Void,
        Result: WikiArticleDatabaseRow,
        execute: () => sql`SELECT * FROM wiki_articles ORDER BY created_at ASC`,
      })

      const findCrdtRowById = SqlSchema.findOneOption({
        Request: WikiArticleId,
        Result: WikiArticleCrdtRow,
        execute: (id) => sql`SELECT * FROM wiki_article_crdts WHERE id = ${id}`,
      })

      const findRevisionById = SqlSchema.findOneOption({
        Request: WikiArticleRevisionId,
        Result: WikiArticleRevisionRow,
        execute: (id) => sql`SELECT * FROM wiki_article_revisions WHERE id = ${id}`,
      })

      const listPendingRevisionsByWikiArticleId = SqlSchema.findAll({
        Request: WikiArticleId,
        Result: WikiArticleRevisionRow,
        execute: (wikiArticleId) => sql`
          SELECT * FROM wiki_article_revisions
          WHERE wiki_article_id = ${wikiArticleId} AND evaluation = 'PENDING'
          ORDER BY created_at ASC
        `,
      })

      const listTranslationRowsByWikiArticleId = SqlSchema.findAll({
        Request: WikiArticleId,
        Result: WikiArticleTranslationMaterializedRow,
        execute: (wikiArticleId) => sql`
          SELECT * FROM wiki_article_translations WHERE wiki_article_id = ${wikiArticleId}
        `,
      })

      const listTranslationHandleRowsByWikiArticleId = SqlSchema.findAll({
        Request: WikiArticleId,
        Result: WikiArticleTranslationHandleDatabaseRow,
        execute: (wikiArticleId) => sql`
          SELECT * FROM wiki_article_translation_handles WHERE wiki_article_id = ${wikiArticleId}
        `,
      })

      const findHandleOwner = SqlSchema.findOneOption({
        Request: WikiArticleLookup,
        Result: WikiArticleHandleOwnerRow,
        execute: ({ handle, kind }) => sql`
          SELECT * FROM wiki_article_handle_owners
          WHERE kind = ${kind} AND handle = ${handle}
        `,
      })

      const insertCrdtRow = SqlSchema.void({
        Request: WikiArticleCrdtRow,
        execute: (row) => sql`INSERT INTO wiki_article_crdts ${sql.insert(row)}`,
      })

      const insertRevisionRow = SqlSchema.void({
        Request: WikiArticleRevisionRow,
        execute: (row) => sql`INSERT INTO wiki_article_revisions ${sql.insert(row)}`,
      })

      const updateCrdtRow = SqlSchema.void({
        Request: WikiArticleCrdtRow,
        execute: ({ id, createdAt: _, ...update }) =>
          sql`UPDATE wiki_article_crdts SET ${sql.update(update)} WHERE id = ${id}`,
      })

      const updateRevisionRow = SqlSchema.void({
        Request: WikiArticleRevisionRow.mapFields(
          Struct.omit([
            "createdAt",
            "createdById",
            "crdtUpdate",
            "fromCrdtFrontier",
            "wikiArticleId",
          ]),
        ),
        execute: ({ id, ...update }) =>
          sql`UPDATE wiki_article_revisions SET ${sql.update(update)} WHERE id = ${id}`,
      })

      const upsertArticleRow = SqlSchema.void({
        Request: WikiArticleDatabaseRow,
        execute: (row) => sql`
          INSERT INTO wiki_articles ${sql.insert(row)}
          ON CONFLICT(id) DO UPDATE SET ${sql.update(row, ["id", "createdAt"])}
        `,
      })

      const insertTranslationRows = SqlSchema.void({
        Request: Schema.Array(WikiArticleTranslationMaterializedRow),
        execute: EffectArray.match({
          onEmpty: () => Effect.void,
          onNonEmpty: (rows) => sql`INSERT INTO wiki_article_translations ${sql.insert(rows)}`,
        }),
      })

      const insertHandleOwnerRow = SqlSchema.void({
        Request: WikiArticleHandleOwnerRow,
        execute: (row) => sql`
          INSERT INTO wiki_article_handle_owners ${sql.insert(row)}
          ON CONFLICT(kind, handle) DO NOTHING
        `,
      })

      const insertTranslationHandleRow = SqlSchema.void({
        Request: WikiArticleTranslationHandleDatabaseRow,
        execute: (row) => sql`INSERT INTO wiki_article_translation_handles ${sql.insert(row)}`,
      })

      const materializeTranslations = (input: {
        sourceData: WikiArticleEditableData
        wikiArticleId: WikiArticleId
      }) =>
        materializeJunctionTable({
          deleteRows: sql`
            DELETE FROM wiki_article_translations WHERE wiki_article_id = ${input.wikiArticleId}
          `,
          insertRows: insertTranslationRows(
            Record.toEntries({
              en: input.sourceData.translations.en,
              es: input.sourceData.translations.es,
              pt: input.sourceData.translations.pt,
            }).flatMap(([locale, translation]) => {
              if (!translation || !Schema.is(Locale)(locale)) return []

              return [
                WikiArticleTranslationMaterializedRow.make({
                  commonNames: translation.commonNames,
                  // @todo turn into FTS-friendly string
                  searchableNames: EffectArray.map(
                    translation.commonNames,
                    (name) => name.value,
                  ).join(" "),
                  content: translation.content,
                  contentPlainText: Option.match(translation.content, {
                    onNone: () => "",
                    onSome: tiptapToText,
                  }),
                  grammaticalGender: translation.grammaticalGender,
                  locale,
                  wikiArticleId: input.wikiArticleId,
                }),
              ]
            }),
          ),
        })

      const chooseAvailableHandle = (input: {
        kind: WikiArticleKind
        names: ReadonlyArray<NameInCrdtList>
        wikiArticleId: WikiArticleId
      }) =>
        Effect.gen(function* () {
          const candidates = Array.from({ length: input.names.length }, (_, index) =>
            toHandleCandidate(input.names, index + 1),
          ).flatMap(Option.toArray)
          const fallback = fallbackHandle({
            names: input.names,
            wikiArticleId: input.wikiArticleId,
          })
          const candidatesWithFallback = [...EffectArray.dedupe(candidates), fallback]

          const available = yield* Effect.findFirst(candidatesWithFallback, (handle) =>
            findHandleOwner({ handle, kind: input.kind }).pipe(
              Effect.map(
                Option.match({
                  onNone: () => true,
                  onSome: (owner) => owner.wikiArticleId === input.wikiArticleId,
                }),
              ),
            ),
          )

          // @todo Expand the fallback suffix if the first eight UUID characters ever collide.
          return Option.getOrElse(available, () => fallback)
        })

      const materializeHandles = (input: {
        sourceData: WikiArticleEditableData
        wikiArticleId: WikiArticleId
      }) =>
        Effect.gen(function* () {
          const existingRows = yield* listTranslationHandleRowsByWikiArticleId(input.wikiArticleId)

          yield* sql`
            DELETE FROM wiki_article_translation_handles
            WHERE wiki_article_id = ${input.wikiArticleId}
          `
          yield* sql`
            DELETE FROM wiki_article_handle_owners
            WHERE wiki_article_id = ${input.wikiArticleId}
          `

          yield* Effect.forEach(
            Record.toEntries({
              en: input.sourceData.translations.en,
              es: input.sourceData.translations.es,
              pt: input.sourceData.translations.pt,
            }),
            ([locale, translation]) =>
              Effect.gen(function* () {
                if (!translation || !Schema.is(Locale)(locale)) return

                const existing = existingRows.find((row) => row.locale === locale)
                const handle =
                  existing?.kind === input.sourceData._tag
                    ? existing.handle
                    : yield* chooseAvailableHandle({
                        kind: input.sourceData._tag,
                        names: translation.commonNames,
                        wikiArticleId: input.wikiArticleId,
                      })

                yield* insertHandleOwnerRow({
                  handle,
                  kind: input.sourceData._tag,
                  wikiArticleId: input.wikiArticleId,
                })
                yield* insertTranslationHandleRow({
                  handle,
                  kind: input.sourceData._tag,
                  locale,
                  wikiArticleId: input.wikiArticleId,
                })
              }),
            { concurrency: 1 },
          )
        })

      const materializeArticle = (input: {
        currentCrdtFrontier: LoroDocFrontier
        sourceData: WikiArticleEditableData
        status: WikiArticleStatus
        wikiArticleId: WikiArticleId
      }) =>
        Effect.gen(function* () {
          const existing = yield* findDatabaseRowById(input.wikiArticleId)
          const now = yield* DateTime.now
          const createdAt = Option.match(existing, {
            onNone: () => now,
            onSome: (row) => row.createdAt,
          })

          yield* upsertArticleRow({
            attributes: encodeArticleAttributes(input.sourceData),
            createdAt,
            currentCrdtFrontier: input.currentCrdtFrontier,
            id: input.wikiArticleId,
            kind: input.sourceData._tag,
            status: input.status,
            updatedAt: now,
          })
          yield* materializeTranslations(input)
          yield* materializeHandles(input)
        })

      const findById = (id: WikiArticleId) =>
        findDatabaseRowById(id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.succeed(Option.none()),
              onSome: (row) => decodeArticleRow(row).pipe(Effect.map(Option.some)),
            }),
          ),
        )

      const findByHandleAndKind = (input: { handle: Handle; kind: WikiArticleKind }) =>
        findDatabaseRowByHandleAndKind(input).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.succeed(Option.none()),
              onSome: (row) => decodeArticleRow(row).pipe(Effect.map(Option.some)),
            }),
          ),
        )

      const findAll = () =>
        listDatabaseRows().pipe(
          Effect.flatMap((rows) => Effect.forEach(rows, decodeArticleRow, { concurrency: 1 })),
        )

      const createWikiArticle = (input: CreateWikiArticleInput) =>
        Effect.gen(function* () {
          const wikiArticleId = yield* IdGen.make(WikiArticleId)
          const revisionId = yield* IdGen.make(WikiArticleRevisionId)
          const now = yield* DateTime.now
          const created = createWikiArticleSnapshot(input.sourceData)

          yield* persistCrdtDocumentCreation({
            insertCrdt: insertCrdtRow({
              createdAt: now,
              crdtSnapshot: created.crdtSnapshot,
              id: wikiArticleId,
              status: input.status,
              updatedAt: now,
            }),
            insertCommitOrRevision: insertRevisionRow({
              createdAt: now,
              createdById: input.createdById,
              crdtUpdate: created.initialCrdtUpdate,
              evaluatedAt: Option.some(now),
              evaluatedById: Option.some(input.createdById),
              evaluation: "APPROVED",
              evaluationReason: Option.none(),
              fromCrdtFrontier: EMPTY_LORO_DOC_FRONTIER,
              id: revisionId,
              updatedAt: now,
              wikiArticleId,
            }),
            materialize: materializeArticle({
              currentCrdtFrontier: created.currentCrdtFrontier,
              sourceData: input.sourceData,
              status: input.status,
              wikiArticleId,
            }),
          })

          return wikiArticleId
        }).pipe(sql.withTransaction)

      const createRevision = (input: CreateWikiArticleRevisionInput) =>
        Effect.gen(function* () {
          const article = yield* findCrdtRowById(input.wikiArticleId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(new WikiArticleNotFoundError({ id: input.wikiArticleId })),
                onSome: Effect.succeed,
              }),
            ),
          )
          const applied = yield* applyWikiArticleCrdtUpdateWithCommit({
            commit: HumanCommit.make({ personId: input.createdById }),
            crdtUpdate: input.crdtUpdate,
            snapshot: article.crdtSnapshot,
          })
          const revisionId = yield* IdGen.make(WikiArticleRevisionId)
          const now = yield* DateTime.now

          yield* insertRevisionRow({
            createdAt: now,
            createdById: input.createdById,
            crdtUpdate: applied.crdtUpdate,
            evaluatedAt: Option.none(),
            evaluatedById: Option.none(),
            evaluation: "PENDING",
            evaluationReason: Option.none(),
            fromCrdtFrontier: applied.fromCrdtFrontier,
            id: revisionId,
            updatedAt: now,
            wikiArticleId: input.wikiArticleId,
          })

          return revisionId
        }).pipe(sql.withTransaction)

      const evaluateRevision = (input: EvaluateWikiArticleRevisionInput) =>
        Effect.gen(function* () {
          const revision = yield* findRevisionById(input.revisionId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(new WikiArticleRevisionNotFoundError({ id: input.revisionId })),
                onSome: Effect.succeed,
              }),
            ),
          )

          if (revision.evaluation !== "PENDING") {
            return yield* new WikiArticleRevisionAlreadyEvaluatedError({ id: revision.id })
          }

          const now = yield* DateTime.now
          const evaluatedRevision = WikiArticleRevisionRow.make({
            ...revision,
            evaluatedAt: Option.some(now),
            evaluatedById: Option.some(input.evaluatedById),
            evaluation: input.evaluation,
            evaluationReason: Option.fromNullishOr(input.evaluationReason),
            updatedAt: now,
          })

          if (input.evaluation === "REJECTED") {
            yield* updateRevisionRow(evaluatedRevision)
            return
          }

          const article = yield* findCrdtRowById(revision.wikiArticleId).pipe(
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(new WikiArticleNotFoundError({ id: revision.wikiArticleId })),
                onSome: Effect.succeed,
              }),
            ),
          )
          const updated = yield* parseWikiArticleCrdtUpdate({
            crdtUpdate: revision.crdtUpdate,
            snapshot: article.crdtSnapshot,
          })

          yield* persistCrdtDocumentUpdate({
            updateCrdtRow: updateCrdtRow({
              ...article,
              crdtSnapshot: loroDocToSnapshot(updated.loroDoc),
              updatedAt: now,
            }),
            insertCommitOrUpdateRevision: updateRevisionRow(evaluatedRevision),
            materialize: materializeArticle({
              currentCrdtFrontier: LoroDocFrontier.make(updated.loroDoc.frontiers()),
              sourceData: updated.data,
              status: article.status,
              wikiArticleId: article.id,
            }),
          })
        }).pipe(sql.withTransaction)

      return {
        createRevision,
        createWikiArticle,
        evaluateRevision,
        findAll,
        findByHandleAndKind,
        findById,
        findCrdtRowById,
        findRevisionById,
        listPendingRevisionsByWikiArticleId,
        listTranslationHandleRowsByWikiArticleId,
        listTranslationRowsByWikiArticleId,
      } as const
    }),
  },
) {}
