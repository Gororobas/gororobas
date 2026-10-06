import { WikiArticleCrdt } from "@gororobas/domain"
import {
  CreateWikiArticleInput,
  CreateWikiArticleRevisionInput,
  projectArticle,
  projectTranslation,
  EMPTY_LORO_DOC_FRONTIER,
  EvaluateWikiArticleRevisionInput,
  HumanCommit,
  IdGen,
  Locale,
  LoroDocFrontier,
  loroDocToSnapshot,
  NameInCrdtList,
  stringToHandle,
  WikiArticleEditableData,
  WikiArticleHandleProjectionRow,
  WikiArticleId,
  WikiArticleKind,
  WikiArticleNotFoundError,
  WikiArticleRevisionAlreadyEvaluatedError,
  WikiArticleRevisionId,
  WikiArticleRevisionNotFoundError,
  WikiArticleRevisionRow,
  WikiArticleStatus,
} from "@gororobas/domain"
import { Context, DateTime, Effect, Array as EffectArray, Option, Result } from "effect"
import { SqlClient } from "effect/sql"

import {
  persistCrdtDocumentCreation,
  persistCrdtDocumentUpdate,
} from "../common/crdt-aggregate-persistence.js"
import { persistProjectionJunctionTables } from "../common/table-projection.js"
import { requestExternalDataFetch } from "./external-data/workflow.js"
import {
  insertCrdtRow,
  insertHandleRows,
  insertRevisionRow,
  insertTranslationRows,
  updateCrdtRow,
  updateRevisionRow,
  upsertArticleRow,
} from "./mutations.js"
import {
  findCrdtRowById,
  findDatabaseRowByHandle,
  findDatabaseRowById,
  findHandleOwner,
  findPageByHandleAndKind,
  findRevisionById,
  findWikiArticleBySearchableName,
} from "./queries.js"

/**
 * Returns a list of handle candidates for the given names. Candidates are:
 * - `first-name`
 * - `first-name-second-name`
 * - `first-name-second-name-third-name`
 * ...
 * - `first-name-adbe4fa1ad35`
 **/
const getPreferredHandleCandidates = Effect.fn("getPreferredHandleCandidates")(function* ({
  names,
  kind,
  id,
}: {
  names: ReadonlyArray<NameInCrdtList>
  kind: WikiArticleKind
  id: WikiArticleId
}) {
  const results = yield* Effect.all(
    names.map((_, index) =>
      stringToHandle(
        names
          .slice(0, index + 1)
          .map((name) => name.value)
          .join(" ")
          .slice(0, 48),
      ),
    ),
    {
      concurrency: "unbounded",
      mode: "result",
    },
  )

  const plainTextCandidates = EffectArray.dedupe(EffectArray.getSuccesses(results))

  const idSuffix = EffectArray.last(id.split("-"))
  if (Option.isNone(idSuffix)) return plainTextCandidates

  const fallbackWithKind = yield* Effect.all(
    plainTextCandidates.map((candidate) => stringToHandle(`${candidate}-${kind}`)),
    { concurrency: "unbounded", mode: "result" },
  )
  const fallbackWithId = yield* Effect.all(
    plainTextCandidates.map((candidate) => stringToHandle(`${candidate}-${idSuffix.value}`)),
    { concurrency: "unbounded", mode: "result" },
  )

  return [
    ...plainTextCandidates,
    ...EffectArray.getSuccesses(fallbackWithKind),
    ...EffectArray.getSuccesses(fallbackWithId),
  ]
})

const chooseAvailableHandle = (input: {
  kind: WikiArticleKind
  names: ReadonlyArray<NameInCrdtList>
  wikiArticleId: WikiArticleId
}) =>
  Effect.gen(function* () {
    const preferredCandidates = yield* getPreferredHandleCandidates({
      names: input.names,
      kind: input.kind,
      id: input.wikiArticleId,
    })

    const available = yield* Effect.findFirst(preferredCandidates, (handle) =>
      findHandleOwner({ handle, kind: input.kind }).pipe(
        Effect.map(
          Option.match({
            onNone: () => true,
            onSome: (owner) => owner.wikiArticleId === input.wikiArticleId,
          }),
        ),
      ),
    )

    const fallback = yield* stringToHandle(input.wikiArticleId)

    return Option.getOrElse(available, () => fallback)
  })

const persistTranslationProjections = Effect.fn("persistTranslationProjections")(function* (input: {
  sourceData: WikiArticleEditableData
  wikiArticleId: WikiArticleId
}) {
  const sql = yield* SqlClient.SqlClient

  return yield* persistProjectionJunctionTables({
    deleteRows: sql`
      DELETE FROM wiki_article_translations WHERE wiki_article_id = ${input.wikiArticleId}
    `,
    insertRows: insertTranslationRows(
      Locale.literals.flatMap((locale) =>
        Option.toArray(
          projectTranslation({
            article: input.sourceData,
            locale: locale,
            wikiArticleId: input.wikiArticleId,
          }),
        ),
      ),
    ),
  })
})

/**
 * When the target translation is not available, fall back to an existing locale,
 * as ordered by the Locale literal order.
 */
const getTranslation = (sourceData: WikiArticleEditableData, locale: Locale) => {
  const targetTranslation = sourceData.translations[locale]
  if (targetTranslation) return targetTranslation

  const existingLocale = Locale.literals.find((l) => sourceData.translations[l])
  return existingLocale ? sourceData.translations[existingLocale] : undefined
}

const persistHandleProjections = Effect.fn("persistHandleProjections")(function* (input: {
  sourceData: WikiArticleEditableData
  wikiArticleId: WikiArticleId
}) {
  const sql = yield* SqlClient.SqlClient

  const handleRows = yield* Effect.all(
    Locale.literals.flatMap((locale) =>
      Effect.gen(function* () {
        const translation = getTranslation(input.sourceData, locale)
        if (!translation) return Result.failVoid

        const handle = yield* chooseAvailableHandle({
          kind: input.sourceData.kind,
          names: translation.commonNames,
          wikiArticleId: input.wikiArticleId,
        })

        return Result.succeed(
          WikiArticleHandleProjectionRow.make({
            locale,
            handle,
            kind: input.sourceData.kind,
            wikiArticleId: input.wikiArticleId,
          }),
        )
      }),
    ),
    { concurrency: 1 },
  ).pipe(Effect.map(EffectArray.getSuccesses))

  return yield* persistProjectionJunctionTables({
    deleteRows: sql`
      DELETE FROM wiki_article_handles WHERE wiki_article_id = ${input.wikiArticleId}
    `,
    insertRows: insertHandleRows(
      EffectArray.dedupeWith(handleRows, (left, right) => left.handle === right.handle),
    ),
  })
})

const persistArticleProjection = (input: {
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

    yield* upsertArticleRow(
      projectArticle(input.sourceData, {
        createdAt,
        currentCrdtFrontier: input.currentCrdtFrontier,
        id: input.wikiArticleId,
        status: input.status,
        updatedAt: now,
      }),
    )

    yield* persistHandleProjections(input)
    yield* persistTranslationProjections(input)
  })

const createWikiArticle = (
  input: CreateWikiArticleInput,
  options: { id?: WikiArticleId; enrichment?: "submit" | "skip" } = {},
) =>
  SqlClient.SqlClient.use((sql) =>
    Effect.gen(function* () {
      const wikiArticleId = options.id ?? (yield* IdGen.make(WikiArticleId))
      const revisionId = yield* IdGen.make(WikiArticleRevisionId)
      const now = yield* DateTime.now
      const created = yield* WikiArticleCrdt.create(input.wikiArticle)

      yield* persistCrdtDocumentCreation({
        insertCrdt: insertCrdtRow({
          createdAt: now,
          crdtSnapshot: created.crdtSnapshot,
          id: wikiArticleId,
          status: input.status,
          updatedAt: now,
        }),
        insertCommitOrRevision: insertRevisionRow({
          id: revisionId,
          createdAt: now,
          updatedAt: now,
          wikiArticleId,
          createdById: input.createdById,
          crdtUpdate: created.initialCrdtUpdate,
          fromCrdtFrontier: EMPTY_LORO_DOC_FRONTIER,
          evaluatedAt: Option.some(now),
          evaluatedById: Option.some(input.createdById),
          evaluation: "APPROVED",
          evaluationReason: Option.none(),
        }),
        persistProjection: persistArticleProjection({
          currentCrdtFrontier: created.currentCrdtFrontier,
          sourceData: created.data,
          status: input.status,
          wikiArticleId,
        }),
      })

      return {
        ...created.data,
        id: wikiArticleId,
        currentCrdtFrontier: created.currentCrdtFrontier,
      }
    }).pipe(
      sql.withTransaction,
      Effect.tap((article) =>
        options.enrichment === "skip"
          ? Effect.void
          : requestExternalDataFetch(article).pipe(
              Effect.catchCause((cause) =>
                Effect.logError("External data submission failed", cause),
              ),
            ),
      ),
      Effect.map((article) => article.id),
    ),
  )

const createRevision = (input: CreateWikiArticleRevisionInput) =>
  SqlClient.SqlClient.use((sql) =>
    Effect.gen(function* () {
      const article = yield* findCrdtRowById(input.wikiArticleId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new WikiArticleNotFoundError({ id: input.wikiArticleId })),
            onSome: Effect.succeed,
          }),
        ),
      )

      const applied = yield* WikiArticleCrdt.applyUpdate({
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
    }).pipe(sql.withTransaction),
  )

const evaluateRevision = (input: EvaluateWikiArticleRevisionInput) =>
  SqlClient.SqlClient.use((sql) =>
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
            onNone: () => Effect.fail(new WikiArticleNotFoundError({ id: revision.wikiArticleId })),
            onSome: Effect.succeed,
          }),
        ),
      )

      const previous = yield* findDatabaseRowById(article.id)
      const updated = yield* WikiArticleCrdt.parseUpdate({
        crdtUpdate: revision.crdtUpdate,
        snapshot: article.crdtSnapshot,
      })

      yield* persistCrdtDocumentUpdate({
        updateCrdtRow: updateCrdtRow({
          ...article,
          crdtSnapshot: loroDocToSnapshot(updated.document),
          updatedAt: now,
        }),
        insertCommitOrUpdateRevision: updateRevisionRow(evaluatedRevision),
        persistProjection: persistArticleProjection({
          currentCrdtFrontier: LoroDocFrontier.make(updated.document.frontiers()),
          sourceData: updated.data,
          status: article.status,
          wikiArticleId: article.id,
        }),
      })

      return {
        article: {
          ...updated.data,
          id: article.id,
          currentCrdtFrontier: LoroDocFrontier.make(updated.document.frontiers()),
        },
        previous: Option.getOrUndefined(previous),
      }
    }).pipe(
      sql.withTransaction,
      Effect.tap((updated) =>
        updated
          ? requestExternalDataFetch(updated.article, updated.previous).pipe(
              Effect.catchCause((cause) =>
                Effect.logError("External data submission failed", cause),
              ),
            )
          : Effect.void,
      ),
      Effect.asVoid,
    ),
  )

/** @TODO add wiki search and card read paths. */
export class WikiArticlesRepository extends Context.Service<WikiArticlesRepository>()(
  "WikiArticlesRepository",
  {
    // oxlint-disable-next-line require-yield not sure if we can avoid having make as an Effect
    make: Effect.gen(function* () {
      return {
        createRevision,
        createWikiArticle,
        evaluateRevision,
        findPageByHandleAndKind,
        findByHandle: (handle: string) => findDatabaseRowByHandle(handle),
        findBySearchableName: (pattern: string) => findWikiArticleBySearchableName(pattern),
      } as const
    }),
  },
) {}
