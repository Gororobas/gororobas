import {
  assertAuthenticated,
  BookmarkState,
  CreateWikiArticlePayload,
  CreateWikiArticleRevisionPayload,
  EvaluateWikiArticleRevisionPayload,
  InvalidCrdtUpdateError,
  MediaAssetId,
  MediaNotFoundError,
  Policies,
  SupportedLanguage,
  WikiArticleCrdt,
  WikiArticleId,
  WikiArticleLookup,
  WikiArticleNotFoundError,
  WikiArticleRevisionId,
  WikiArticleRevisionNotFoundError,
  type PlantCultivarProjectedAttributes,
  type WikiArticleEditableData,
  type WikiSearchParams,
} from "@gororobas/domain"
import { Array as EffectArray, Context, DateTime, Effect, Match, Option } from "effect"
import { SqlClient } from "effect/sql"

import { MediaAssetsRepository } from "../media-assets/repository.js"
import { MediaAssetsService } from "../media-assets/service.js"
import { requestExternalDataFetch } from "./external-data/workflow.js"
import { WikiArticlesRepository } from "./repository.js"

const resolveProperty = <A>(
  property: { _tag: "Unknown" } | { _tag: "Inherit" } | { _tag: "Value"; value: A },
  parent: Option.Option<A>,
): Option.Option<A> =>
  Match.value(property).pipe(
    Match.discriminatorsExhaustive("_tag")({
      Unknown: () => Option.none<A>(),
      Inherit: () => parent,
      Value: ({ value }) => Option.some(value),
    }),
  )

export class WikiArticlesService extends Context.Service<WikiArticlesService>()(
  "WikiArticlesService",
  {
    make: Effect.gen(function* () {
      const repository = yield* WikiArticlesRepository
      const media = yield* MediaAssetsService
      const mediaRepository = yield* MediaAssetsRepository
      const sql = yield* SqlClient.SqlClient

      const getPublishedArticle = (id: WikiArticleId) =>
        repository.findById(id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new WikiArticleNotFoundError({ id })),
              onSome: (article) =>
                article.status === "PUBLISHED"
                  ? Effect.succeed(article)
                  : Effect.fail(new WikiArticleNotFoundError({ id })),
            }),
          ),
        )

      const validateParentIfCultivar = (article: WikiArticleEditableData) =>
        Effect.gen(function* () {
          if (article.kind === "PLANT_CULTIVAR") {
            const parent = yield* getPublishedArticle(article.attributes.parentPlantId)
            if (parent.kind !== "PLANT") {
              return yield* new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
            }
          }
        })

      const createWikiArticle = (input: CreateWikiArticlePayload) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.wiki.canCreate
          yield* validateParentIfCultivar(input.wikiArticle)

          // Media selections require their own attachment/revision orchestration.
          if (input.mediaAssets !== undefined) {
            return yield* new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
          }

          return yield* repository.createWikiArticle(
            {
              ...input,
              createdById: session.personId,
              status: "PENDING_APPROVAL",
            },
            { isPendingApproval: true },
          )
        }).pipe(sql.withTransaction)

      const createRevision = (id: WikiArticleId, input: CreateWikiArticleRevisionPayload) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.wiki.canRevise
          yield* getPublishedArticle(id)
          if (input.mediaAssets !== undefined) {
            return yield* new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
          }

          return yield* repository.createRevision({
            ...input,
            wikiArticleId: id,
            createdById: session.personId,
          })
        })

      const evaluateRevision = (
        revisionId: WikiArticleRevisionId,
        { status, reason }: EvaluateWikiArticleRevisionPayload,
      ) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.wiki.canEvaluateRevision
          const revision = yield* repository.findRevisionById(revisionId)
          if (Option.isNone(revision)) {
            return yield* new WikiArticleRevisionNotFoundError({ id: revisionId })
          }

          const previous = yield* repository.findById(revision.value.wikiArticleId)

          if (status === "APPROVED") {
            const stored = yield* repository.findSourceRowById(revision.value.wikiArticleId)
            if (Option.isNone(stored)) {
              return yield* new WikiArticleNotFoundError({ id: revision.value.wikiArticleId })
            }
            const updated = yield* WikiArticleCrdt.parseUpdate({
              snapshot: stored.value.crdtSnapshot,
              crdtUpdate: revision.value.crdtUpdate,
            })
            yield* validateParentIfCultivar(updated.data)
          }

          yield* repository.evaluateRevision(
            {
              revisionId,
              evaluation: status,
              evaluatedById: session.personId,
              evaluationReason: reason,
            },
            { enrichment: "skip" },
          )

          return status === "APPROVED"
            ? {
                article: yield* getPublishedArticle(revision.value.wikiArticleId),
                previous: Option.getOrUndefined(previous),
              }
            : undefined
        }).pipe(
          sql.withTransaction,
          Effect.tap((updated) =>
            updated && status === "APPROVED"
              ? requestExternalDataFetch(updated.article, updated.previous).pipe(
                  Effect.catchCause((cause) =>
                    Effect.logError("External data submission failed", cause),
                  ),
                )
              : Effect.void,
          ),
          Effect.asVoid,
        )

      const getPage = (lookup: WikiArticleLookup & { language: SupportedLanguage }) =>
        Effect.gen(function* () {
          const page = yield* repository.findPageByHandleAndKind(lookup)
          if (Option.isNone(page)) return yield* new WikiArticleNotFoundError(lookup)

          return {
            ...page.value,
            translationUnavailable: page.value.language !== lookup.language,
            cultivars:
              page.value.kind === "PLANT"
                ? yield* repository.listPublishedCultivars({
                    parentPlantId: page.value.id,
                    language: lookup.language,
                  })
                : [],
            parentPlant:
              page.value.kind === "PLANT_CULTIVAR"
                ? yield* findParentPlant({
                    parentPlantId: page.value.attributes.parentPlantId,
                    language: lookup.language,
                  })
                : Option.none(),
          }
        })

      const findParentPlant = ({
        parentPlantId,
        language,
      }: {
        parentPlantId: WikiArticleId
        language: SupportedLanguage
      }) =>
        Effect.gen(function* () {
          const maybeParent = yield* repository.findById(parentPlantId)
          const cards = yield* repository.listCardsByIds({
            wikiArticleIds: [parentPlantId],
            language,
          })

          return Option.flatMap(
            Option.all({
              parent: Option.filter(maybeParent, (parent) => parent.status === "PUBLISHED"),
              card: EffectArray.head(cards),
            }),
            ({ parent, card }) =>
              parent.kind === "PLANT"
                ? Option.some({ card, attributes: parent.attributes })
                : Option.none(),
          )
        })

      const listRelatedWikiArticles = (
        lookup: WikiArticleLookup & { language: SupportedLanguage },
      ) =>
        Effect.gen(function* () {
          const page = yield* getPage(lookup)
          return yield* repository.listRelatedCards({
            wikiArticleId: page.id,
            language: lookup.language,
          })
        })

      const resolveCultivar = (attributes: PlantCultivarProjectedAttributes) =>
        Effect.gen(function* () {
          const parent = yield* getPublishedArticle(attributes.parentPlantId)
          if (parent.kind !== "PLANT") {
            return yield* new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
          }
          const values = parent.attributes

          return {
            scientificNames: resolveProperty(attributes.scientificNames, values.scientificNames),
            developmentCycle: resolveProperty(
              attributes.developmentCycle,
              Option.all({ min: values.developmentCycleMin, max: values.developmentCycleMax }),
            ),
            height: resolveProperty(
              attributes.height,
              Option.all({ min: values.heightMin, max: values.heightMax }),
            ),
            temperature: resolveProperty(
              attributes.temperature,
              Option.all({ min: values.temperatureMin, max: values.temperatureMax }),
            ),
            edibleParts: resolveProperty(attributes.edibleParts, values.edibleParts),
            lifecycles: resolveProperty(attributes.lifecycles, values.lifecycles),
            plantingMethods: resolveProperty(attributes.plantingMethods, values.plantingMethods),
            strata: resolveProperty(attributes.strata, values.strata),
            usage: resolveProperty(attributes.usage, values.usage),
          }
        })

      const attachMediaToWikiArticle = (input: {
        wikiArticleId: WikiArticleId
        mediaAssetId: MediaAssetId
        category?: string | null | undefined
      }) =>
        Effect.gen(function* () {
          yield* Policies.wiki.canRevise
          yield* getPublishedArticle(input.wikiArticleId)
          const attached = yield* repository.listWikiArticleMedia(input.wikiArticleId)
          const asset = yield* media.getMediaForAttachment(input.mediaAssetId, {
            isAlreadyAttached: attached.some((row) => row.id === input.mediaAssetId),
          })
          if (asset.format !== "IMAGE") return yield* new MediaNotFoundError({ id: asset.id })
          yield* repository.attachMediaToWikiArticle(input)

          if (input.category !== undefined) {
            yield* mediaRepository.updateMediaAssetDescriptions({
              ...asset,
              category: input.category,
              updatedAt: yield* DateTime.now,
            })
          }
        }).pipe(sql.withTransaction)

      const setMainMedia = (input: { wikiArticleId: WikiArticleId; mediaAssetId: MediaAssetId }) =>
        Effect.gen(function* () {
          yield* Policies.wiki.canEvaluateRevision
          yield* getPublishedArticle(input.wikiArticleId)
          const attached = yield* repository.listWikiArticleMedia(input.wikiArticleId)

          if (
            !attached.some((asset) => asset.id === input.mediaAssetId && asset.format === "IMAGE")
          ) {
            return yield* new MediaNotFoundError({ id: input.mediaAssetId })
          }

          yield* repository.setMainMedia(input)
        }).pipe(sql.withTransaction)

      const bookmark = (wikiArticleId: WikiArticleId, state: BookmarkState = "INTERESTED") =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.wiki.canBookmark
          yield* getPublishedArticle(wikiArticleId)
          yield* repository.setBookmark({ personId: session.personId, wikiArticleId, state })
        })

      const removeBookmark = (wikiArticleId: WikiArticleId) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.wiki.canRemoveBookmark(session.personId)
          yield* repository.removeBookmark({ personId: session.personId, wikiArticleId })
        })

      const listBookmarks = assertAuthenticated.pipe(
        Effect.flatMap((session) => repository.listBookmarks(session.personId)),
      )

      const listBookmarkers = (lookup: WikiArticleLookup) =>
        getPage({ ...lookup, language: "pt" }).pipe(
          Effect.flatMap((page) => repository.listBookmarkers(page.id)),
        )

      const listCultivarCards = (lookup: WikiArticleLookup & { language: SupportedLanguage }) =>
        getPage(lookup).pipe(
          Effect.flatMap((page) =>
            page.kind === "PLANT"
              ? repository.listCultivarCards({ parentPlantId: page.id, language: lookup.language })
              : Effect.succeed([]),
          ),
        )

      const listContributors = (lookup: WikiArticleLookup) =>
        getPage({ ...lookup, language: "pt" }).pipe(
          Effect.flatMap((page) => repository.listContributors(page.id)),
        )

      return {
        createWikiArticle,
        createRevision,
        evaluateRevision,
        listRevisionHistory: repository.listRevisionHistory,
        getPage,
        listRelatedWikiArticles,
        resolveCultivar,
        getPublishedArticle,
        listCards: (language: SupportedLanguage) => repository.listCards(language),
        searchWikiArticles: Effect.fn("wiki.search")(function* (params: WikiSearchParams) {
          yield* Effect.annotateCurrentSpan({
            "wiki.article.kind": params.kind ?? "all",
            "wiki.search.language": params.language ?? "pt",
            "wiki.search.has_text": params.text !== undefined,
          })

          const articles = yield* repository.searchCards({
            search: params,
            language: params.language ?? "pt",
          })
          yield* Effect.annotateCurrentSpan("wiki.search.result_count", articles.length)
          return articles
        }),
        attachMediaToWikiArticle,
        setMainMedia,
        listCultivars: (id: WikiArticleId) =>
          getPublishedArticle(id).pipe(
            Effect.andThen(
              repository.listPublishedCultivars({ parentPlantId: id, language: "pt" }),
            ),
          ),
        getThumbnail: (id: WikiArticleId) =>
          getPublishedArticle(id).pipe(Effect.andThen(repository.findMainMedia(id))),
        bookmark,
        removeBookmark,
        listBookmarks,
        listBookmarkers,
        listContributors,
        listCultivarCards,
      }
    }),
  },
) {}
