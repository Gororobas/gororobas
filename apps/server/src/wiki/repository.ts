import { WikiArticleCrdt } from "@gororobas/domain"
import {
  CreateWikiArticleInput,
  CreateWikiArticleRevisionInput,
  entityReferenceRelations,
  projectArticle,
  projectTranslation,
  EMPTY_LORO_DOC_FRONTIER,
  EvaluateWikiArticleRevisionInput,
  type Handle,
  HumanCommit,
  IdGen,
  InvalidCrdtUpdateError,
  SupportedLanguage,
  LoroDocFrontier,
  loroDocToSnapshot,
  WikiArticleCommonNameInCrdtList,
  WikiArticleEditableData,
  WikiArticleHandleProjectionRow,
  WikiArticleId,
  WikiArticleNotFoundError,
  WikiArticleRevisionAlreadyEvaluatedError,
  WikiArticleRevisionId,
  WikiArticleRevisionNotFoundError,
  WikiArticleRevisionRow,
  WikiArticleStatus,
  type WikiArticleProjectionRow,
} from "@gororobas/domain"
import { Context, DateTime, Effect, Array as EffectArray, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"

import {
  persistCrdtDocumentCreation,
  persistCrdtDocumentUpdate,
} from "../common/crdt-aggregate-persistence.js"
import { allocateHandle } from "../common/handle-allocation.js"
import { persistProjectionJunctionTables } from "../common/table-projection.js"
import { requestWikiArticleLinkInference } from "../link-inference/wiki-article-link-inference-definition.js"
import { type ExternalDataArticle } from "./external-data/persist-utils.js"
import { requestExternalDataFetch } from "./external-data/workflow.js"
import {
  setBookmark,
  removeBookmark,
  setMainMedia,
  attachMediaToWikiArticle,
  applyRevisionMediaDetails,
  removeUnselectedWikiArticleMedia,
  insertSourceRow,
  insertHandleRows,
  replaceRelations,
  insertRevisionRow,
  insertRevisionMediaAssetRows,
  insertTranslationRows,
  updateSourceRow,
  updateRevisionRow,
  upsertArticleRow,
} from "./mutations.js"
import {
  listCards,
  listCardsByIds,
  listRelatedCards,
  searchCards,
  listRevisionHistory,
  listPublishedCultivars,
  listCultivarCards,
  listBookmarks,
  listBookmarkers,
  listContributors,
  listWikiArticleMedia,
  listRevisionMediaAssets,
  findMainMedia,
  findSourceRowById,
  findDatabaseRowByHandle,
  findDatabaseRowById,
  findHandleOwner,
  listHandleRows,
  findPageByHandleAndKind,
  findRevisionById,
  findWikiArticleBySearchableName,
  listWikiArticleAliases,
} from "./queries.js"

/**
 * Names to try as an article's handle, most readable first: its first common name, then its first
 * two names together, and so on.
 */
const handleNames = (names: ReadonlyArray<WikiArticleCommonNameInCrdtList>) =>
  names.map((_, index) =>
    names
      .slice(0, index + 1)
      .map((value) => value.name)
      .join(" ")
      .slice(0, 48),
  )

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
 * Each language gets a handle the first time the article has a translation in it, and keeps it:
 * handles are never replaced or removed, so links keep working after names change. Readers reach
 * languages without a translation of their own through the other languages' handles.
 */
const persistHandleProjections = Effect.fn("persistHandleProjections")(function* (input: {
  sourceData: WikiArticleEditableData
  wikiArticleId: WikiArticleId
}) {
  const { kind } = input.sourceData
  const existing = yield* listHandleRows(input.wikiArticleId)

  const isAvailable = (handle: Handle) =>
    findHandleOwner({ handle, kind }).pipe(
      Effect.map(
        Option.match({
          onNone: () => true,
          onSome: (owner) => owner.wikiArticleId === input.wikiArticleId,
        }),
      ),
    )

  const allocated = yield* Effect.forEach(
    SupportedLanguage.literals.flatMap((language) => {
      const translation = input.sourceData.translations[language]
      return translation === undefined || existing.some((row) => row.language === language)
        ? []
        : [{ language, translation }]
    }),
    ({ language, translation }) =>
      allocateHandle({
        names: handleNames(translation.commonNames),
        fallbackName: input.wikiArticleId,
        isAvailable,
      }).pipe(
        Effect.map((handle) =>
          WikiArticleHandleProjectionRow.make({
            language,
            handle,
            kind,
            wikiArticleId: input.wikiArticleId,
          }),
        ),
      ),
    { concurrency: 1 },
  )

  // Translations can share a handle, which the article only owns once.
  yield* insertHandleRows(
    EffectArray.dedupeWith(
      allocated.filter((row) => !existing.some((current) => current.handle === row.handle)),
      (left, right) => left.handle === right.handle,
    ),
  )
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

/** A defect: an approval's guarded write found the article changed since its in-transaction read. */
class WikiArticleSourceChangedError extends Schema.TaggedError<WikiArticleSourceChangedError>()(
  "WikiArticleSourceChangedError",
  { id: WikiArticleId },
) {}

/**
 * A cultivar names its parent plant, which must already be a published PLANT. Checked on creation,
 * revision and approval, since the parent can change status between a revision and its evaluation.
 */
const assertCultivarParentIsPublishedPlant = Effect.fn("assertCultivarParentIsPublishedPlant")(
  function* (article: WikiArticleEditableData) {
    if (article.kind !== "PLANT_CULTIVAR") return

    const { parentPlantId } = article.attributes
    const parent = yield* findDatabaseRowById(parentPlantId)
    if (Option.isNone(parent) || parent.value.status !== "PUBLISHED") {
      return yield* new WikiArticleNotFoundError({ id: parentPlantId })
    }
    if (parent.value.kind !== "PLANT") {
      return yield* new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
    }
  },
)

/** A revision that carries a media selection makes it the article's full set of media. */
const applyRevisionMediaSelection = Effect.fn("applyRevisionMediaSelection")(function* (input: {
  revisionId: WikiArticleRevisionId
  wikiArticleId: WikiArticleId
  updatedAt: DateTime.Utc
}) {
  const selection = yield* listRevisionMediaAssets(input.revisionId)
  const selectedMediaAssetIds = selection.map((row) => row.mediaAssetId)

  yield* removeUnselectedWikiArticleMedia({
    wikiArticleId: input.wikiArticleId,
    selectedMediaAssetIds,
  })

  yield* Effect.forEach(
    selectedMediaAssetIds,
    (mediaAssetId) =>
      attachMediaToWikiArticle({ wikiArticleId: input.wikiArticleId, mediaAssetId }),
    { concurrency: 1, discard: true },
  )

  yield* applyRevisionMediaDetails({ revisionId: input.revisionId, updatedAt: input.updatedAt })
})

/**
 * Derived work on newly approved content: external provider data and inferred relations.
 * Best-effort, submitted after the article transaction commits.
 */
export const requestEnrichment = (
  article: ExternalDataArticle,
  previous?: WikiArticleProjectionRow,
) =>
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
      yield* assertCultivarParentIsPublishedPlant(input.wikiArticle)
      const created = yield* WikiArticleCrdt.create(input.wikiArticle)

      yield* persistCrdtDocumentCreation({
        insertCrdt: insertSourceRow({
          createdAt: now,
          crdtSnapshot: created.crdtSnapshot,
          id: wikiArticleId,
          status: input.status,
          updatedAt: now,
        }),
        insertRevision: insertRevisionRow({
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

      if (!options.isPendingApproval && input.mediaAssets !== undefined) {
        yield* applyRevisionMediaSelection({ revisionId, wikiArticleId, updatedAt: now })
      }

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
      const article = yield* findSourceRowById(input.wikiArticleId).pipe(
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

      yield* assertCultivarParentIsPublishedPlant(applied.data)

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

      const article = yield* findSourceRowById(revision.wikiArticleId).pipe(
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
      yield* assertCultivarParentIsPublishedPlant(updated.data)

      yield* persistCrdtDocumentUpdate({
        updateCrdtRow: updateSourceRow({
          ...article,
          status: article.status === "PENDING_APPROVAL" ? "PUBLISHED" : article.status,
          crdtSnapshot: loroDocToSnapshot(updated.document),
          updatedAt: now,
          expectedCrdtFrontier: Option.map(previous, (row) => row.currentCrdtFrontier),
        }).pipe(
          Effect.flatMap(
            Option.match({
              // Unreachable while BEGIN IMMEDIATE serializes writers; a defect if that ever changes.
              onNone: () => Effect.die(new WikiArticleSourceChangedError({ id: article.id })),
              onSome: () => Effect.void,
            }),
          ),
        ),
        persistRevision: updateRevisionRow(evaluatedRevision),
        persistProjection: persistArticleProjection({
          currentCrdtFrontier: LoroDocFrontier.make(updated.document.frontiers()),
          sourceData: updated.data,
          status: article.status === "PENDING_APPROVAL" ? "PUBLISHED" : article.status,
          wikiArticleId: article.id,
        }),
      })

      if (revision.hasMediaSelection) {
        yield* applyRevisionMediaSelection({
          revisionId: revision.id,
          wikiArticleId: article.id,
          updatedAt: now,
        })
      }

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

/** @effect-expect-leaking SqlClient */
export class WikiArticlesRepository extends Context.Service<WikiArticlesRepository>()(
  "WikiArticlesRepository",
  {
    // oxlint-disable-next-line require-yield not sure if we can avoid having make as an Effect
    make: Effect.gen(function* () {
      return {
        findDatabaseRowById,
        listWikiArticleAliases,
        setBookmark,
        removeBookmark,
        setMainMedia,
        listCards,
        listCardsByIds,
        listRelatedCards,
        replaceRelations,
        searchCards,
        listRevisionHistory,
        listPublishedCultivars,
        listCultivarCards,
        listBookmarks,
        listBookmarkers,
        listContributors,
        listWikiArticleMedia,
        findMainMedia,
        findById: findDatabaseRowById,
        findSourceRowById,
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
