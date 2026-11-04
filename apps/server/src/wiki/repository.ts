import { WikiArticleCrdt } from "@gororobas/domain"
import {
  CreateWikiArticleInput,
  CreateWikiArticleRevisionInput,
  type CrdtCommit,
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
} from "@gororobas/domain"
import { Context, DateTime, Effect, Array as EffectArray, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"

import {
  persistCrdtDocumentCreation,
  persistCrdtDocumentUpdate,
} from "../common/crdt-aggregate-persistence.js"
import { allocateHandle } from "../common/handle-allocation.js"
import { persistProjectionJunctionTables } from "../common/table-projection.js"
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
  insertSystemRevisionRow,
  insertRevisionMediaAssetRows,
  insertTranslationRows,
  updateSourceRow,
  updateRevisionRow,
  upsertArticleRow,
  upsertPlaceProjectionRow,
  deletePlaceProjectionRow,
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
  findPublishedDatabaseRowById,
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

const persistPlaceProjection = (input: {
  sourceData: WikiArticleEditableData
  wikiArticleId: WikiArticleId
}) =>
  input.sourceData.kind === "PLACE" && Option.isSome(input.sourceData.attributes.whosOnFirstId)
    ? upsertPlaceProjectionRow({
        wikiArticleId: input.wikiArticleId,
        whosOnFirstId: input.sourceData.attributes.whosOnFirstId.value,
        placeKind: Option.getOrNull(input.sourceData.attributes.placeKind),
      })
    : deletePlaceProjectionRow(input.wikiArticleId)

const persistArticleProjection = (input: {
  currentCrdtFrontier: LoroDocFrontier
  sourceData: WikiArticleEditableData
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
        updatedAt: now,
      }),
    )

    yield* persistHandleProjections(input)
    yield* persistTranslationProjections(input)
    yield* persistPlaceProjection(input)

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
    const parent = yield* findPublishedDatabaseRowById(parentPlantId)
    if (Option.isNone(parent)) {
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
 * People's articles carry a `HumanCommit` and may await evaluation; system processes' carry a
 * `SystemCommit`, are approved as they're created and are attributed to no one.
 */
const insertWikiArticle = (
  input: Omit<CreateWikiArticleInput, "createdById"> & { readonly commit: CrdtCommit },
  options: { id?: WikiArticleId; isPendingApproval?: boolean } = {},
) =>
  SqlClient.SqlClient.use((sql) =>
    Effect.gen(function* () {
      const wikiArticleId = options.id ?? (yield* IdGen.make(WikiArticleId))
      const revisionId = yield* IdGen.make(WikiArticleRevisionId)
      const now = yield* DateTime.now
      yield* assertCultivarParentIsPublishedPlant(input.wikiArticle)
      const created = yield* WikiArticleCrdt.create(input.wikiArticle, input.commit)

      const revision = {
        id: revisionId,
        createdAt: now,
        updatedAt: now,
        wikiArticleId,
        crdtUpdate: created.initialCrdtUpdate,
        fromCrdtFrontier: EMPTY_LORO_DOC_FRONTIER,
        evaluatedAt: options.isPendingApproval ? Option.none() : Option.some(now),
        evaluation: options.isPendingApproval ? "PENDING" : "APPROVED",
        evaluationReason: Option.none(),
        hasMediaSelection: input.mediaAssets !== undefined,
      } satisfies Omit<WikiArticleRevisionRow, "createdById" | "evaluatedById">

      yield* persistCrdtDocumentCreation({
        insertCrdt: insertSourceRow({
          createdAt: now,
          crdtSnapshot: created.crdtSnapshot,
          id: wikiArticleId,
          status: input.status,
          updatedAt: now,
        }),
        insertRevision: Schema.is(HumanCommit)(input.commit)
          ? insertRevisionRow({
              ...revision,
              createdById: input.commit.personId,
              evaluatedById: options.isPendingApproval
                ? Option.none()
                : Option.some(input.commit.personId),
            })
          : insertSystemRevisionRow({
              ...revision,
              createdById: null,
              evaluatedById: Option.none(),
            }),
        persistProjection: options.isPendingApproval
          ? Effect.void
          : persistArticleProjection({
              currentCrdtFrontier: created.currentCrdtFrontier,
              sourceData: created.data,
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
      Effect.map((article) => article.id),
    ),
  )

const createWikiArticle = (
  { createdById, ...input }: CreateWikiArticleInput,
  options: { id?: WikiArticleId; isPendingApproval?: boolean } = {},
) => insertWikiArticle({ ...input, commit: HumanCommit.make({ personId: createdById }) }, options)

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

/** The approved article state and the one it replaced; None when the revision is rejected. */
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
        return Option.none()
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

      return Option.some({
        article: {
          ...updated.data,
          id: article.id,
          currentCrdtFrontier: LoroDocFrontier.make(updated.document.frontiers()),
        },
        previous: Option.getOrUndefined(previous),
      })
    }).pipe(sql.withTransaction),
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
        findPublishedById: findPublishedDatabaseRowById,
        findSourceRowById,
        findRevisionById,
        attachMediaToWikiArticle,
        createRevision,
        createWikiArticle,
        /** For system processes, which carry a `SystemCommit`. */
        createWikiArticleWithCommit: insertWikiArticle,
        evaluateRevision,
        findPageByHandleAndKind,
        findByHandle: (handle: string) => findDatabaseRowByHandle(handle),
        findBySearchableName: (pattern: string) => findWikiArticleBySearchableName(pattern),
      } as const
    }),
  },
) {}
