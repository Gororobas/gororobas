import { WikiArticleCrdt } from "@gororobas/domain"
import {
  CreateWikiArticleInput,
  CreateWikiArticleRevisionInput,
  entityReferenceRelations,
  projectArticle,
  projectTranslation,
  EMPTY_LORO_DOC_FRONTIER,
  EvaluateWikiArticleRevisionInput,
  HumanCommit,
  IdGen,
  SupportedLanguage,
  LoroDocFrontier,
  loroDocToSnapshot,
  WikiArticleCommonNameInCrdtList,
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
  type WikiArticleProjectionRow,
} from "@gororobas/domain"
import { Context, DateTime, Effect, Array as EffectArray, Option, Result } from "effect"
import { SqlClient } from "effect/sql"

import {
  persistCrdtDocumentCreation,
  persistCrdtDocumentUpdate,
} from "../common/crdt-aggregate-persistence.js"
import { persistProjectionJunctionTables } from "../common/table-projection.js"
import { requestWikiArticleLinkInference } from "../link-inference/wiki-article-link-inference-workflow.js"
import { type ExternalDataArticle } from "./external-data/persist-utils.js"
import { requestExternalDataFetch } from "./external-data/workflow.js"
import {
  setBookmark,
  removeBookmark,
  setMainMedia,
  attachMediaToWikiArticle,
  insertCrdtRow,
  insertHandleRows,
  replaceRelations,
  insertRevisionRow,
  insertRevisionMediaAssetRows,
  insertTranslationRows,
  updateCrdtRow,
  updateRevisionRow,
  upsertArticleRow,
} from "./mutations.js"
import {
  listCards,
  listRelatedCards,
  searchCards,
  listRevisionHistory,
  listPublishedCultivars,
  listBookmarks,
  listWikiArticleMedia,
  findMainMedia,
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
  names: ReadonlyArray<WikiArticleCommonNameInCrdtList>
  kind: WikiArticleKind
  id: WikiArticleId
}) {
  const results = yield* Effect.all(
    names.map((_, index) =>
      stringToHandle(
        names
          .slice(0, index + 1)
          .map((value) => value.name)
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
  names: ReadonlyArray<WikiArticleCommonNameInCrdtList>
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
      SupportedLanguage.literals.flatMap((language) =>
        Option.toArray(
          projectTranslation({
            article: input.sourceData,
            language: language,
            wikiArticleId: input.wikiArticleId,
          }),
        ),
      ),
    ),
  })
})

/**
 * When the target translation is not available, fall back to an existing language,
 * as ordered by the SupportedLanguage literal order.
 */
const getTranslation = (sourceData: WikiArticleEditableData, language: SupportedLanguage) => {
  const targetTranslation = sourceData.translations[language]
  if (targetTranslation) return targetTranslation

  const existingLanguage = SupportedLanguage.literals.find((l) => sourceData.translations[l])
  return existingLanguage ? sourceData.translations[existingLanguage] : undefined
}

const persistHandleProjections = Effect.fn("persistHandleProjections")(function* (input: {
  sourceData: WikiArticleEditableData
  wikiArticleId: WikiArticleId
}) {
  const sql = yield* SqlClient.SqlClient

  const handleRows = yield* Effect.all(
    SupportedLanguage.literals.flatMap((language) =>
      Effect.gen(function* () {
        const translation = getTranslation(input.sourceData, language)
        if (!translation) return Result.failVoid

        const handle = yield* chooseAvailableHandle({
          kind: input.sourceData.kind,
          names: translation.commonNames,
          wikiArticleId: input.wikiArticleId,
        })

        return Result.succeed(
          WikiArticleHandleProjectionRow.make({
            language,
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

    yield* replaceRelations({
      wikiArticleId: input.wikiArticleId,
      source: "ENTITY_REFERENCE",
      rows: entityReferenceRelations(input.sourceData, input.wikiArticleId).map((link) => ({
        wikiArticleId: input.wikiArticleId,
        relatedWikiArticleId: link.wikiArticleId,
        source: "ENTITY_REFERENCE",
        evidence: link.evidence,
      })),
    })
  })

/**
 * Derived work on newly approved content: external provider data and inferred relations.
 * Best-effort, submitted after the article transaction commits.
 */
const requestEnrichment = (article: ExternalDataArticle, previous?: WikiArticleProjectionRow) =>
  Effect.all(
    [
      requestExternalDataFetch(article, previous).pipe(
        Effect.catchCause((cause) => Effect.logError("External data submission failed", cause)),
      ),
      requestWikiArticleLinkInference(article, previous).pipe(
        Effect.catchCause((cause) => Effect.logError("Link inference submission failed", cause)),
      ),
    ],
    { concurrency: "unbounded", discard: true },
  )

const createWikiArticle = (
  input: CreateWikiArticleInput,
  options: { id?: WikiArticleId; enrichment?: "submit" | "skip"; isPendingApproval?: boolean } = {},
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
          evaluatedAt: options.isPendingApproval ? Option.none() : Option.some(now),
          evaluatedById: options.isPendingApproval ? Option.none() : Option.some(input.createdById),
          evaluation: options.isPendingApproval ? "PENDING" : "APPROVED",
          evaluationReason: Option.none(),
          hasMediaSelection: input.mediaAssets !== undefined,
        }),
        persistProjection: options.isPendingApproval
          ? Effect.void
          : persistArticleProjection({
              currentCrdtFrontier: created.currentCrdtFrontier,
              sourceData: created.data,
              status: input.status,
              wikiArticleId,
            }),
      })

      yield* insertRevisionMediaAssetRows(
        (input.mediaAssets ?? []).map((selected) => ({
          wikiArticleRevisionId: revisionId,
          mediaAssetId: selected.mediaAssetId,
          category: selected.category ?? null,
          hasCategoryOverride: selected.category !== undefined,
          descriptions: Option.fromUndefinedOr(selected.descriptions),
        })),
      )

      return {
        ...created.data,
        id: wikiArticleId,
        currentCrdtFrontier: created.currentCrdtFrontier,
      }
    }).pipe(
      sql.withTransaction,
      Effect.tap((article) =>
        options.isPendingApproval || options.enrichment === "skip"
          ? Effect.void
          : requestEnrichment(article),
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
        hasMediaSelection: input.mediaAssets !== undefined,
        fromCrdtFrontier: applied.fromCrdtFrontier,
        id: revisionId,
        updatedAt: now,
        wikiArticleId: input.wikiArticleId,
      })

      yield* insertRevisionMediaAssetRows(
        (input.mediaAssets ?? []).map((selected) => ({
          wikiArticleRevisionId: revisionId,
          mediaAssetId: selected.mediaAssetId,
          category: selected.category ?? null,
          hasCategoryOverride: selected.category !== undefined,
          descriptions: Option.fromUndefinedOr(selected.descriptions),
        })),
      )

      return revisionId
    }).pipe(sql.withTransaction),
  )

const evaluateRevision = (
  input: EvaluateWikiArticleRevisionInput,
  options: { enrichment?: "submit" | "skip" } = {},
) =>
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
          status: article.status === "PENDING_APPROVAL" ? "PUBLISHED" : article.status,
          crdtSnapshot: loroDocToSnapshot(updated.document),
          updatedAt: now,
        }),
        insertCommitOrUpdateRevision: updateRevisionRow(evaluatedRevision),
        persistProjection: persistArticleProjection({
          currentCrdtFrontier: LoroDocFrontier.make(updated.document.frontiers()),
          sourceData: updated.data,
          status: article.status === "PENDING_APPROVAL" ? "PUBLISHED" : article.status,
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
        updated && options.enrichment !== "skip"
          ? requestEnrichment(updated.article, updated.previous)
          : Effect.void,
      ),
      Effect.asVoid,
    ),
  )

export class WikiArticlesRepository extends Context.Service<WikiArticlesRepository>()(
  "WikiArticlesRepository",
  {
    // oxlint-disable-next-line require-yield not sure if we can avoid having make as an Effect
    make: Effect.gen(function* () {
      return {
        setBookmark,
        removeBookmark,
        setMainMedia,
        listCards,
        listRelatedCards,
        replaceRelations,
        searchCards,
        listRevisionHistory,
        listPublishedCultivars,
        listBookmarks,
        listWikiArticleMedia,
        findMainMedia,
        findById: findDatabaseRowById,
        findCrdtRowById,
        findRevisionById,
        attachMediaToWikiArticle,
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
