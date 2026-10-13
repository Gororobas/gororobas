import {
  assertAuthenticated,
  BookmarkState,
  CreateWikiArticlePayload,
  CreateWikiArticleRevisionPayload,
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
} from "@gororobas/domain"
import { Context, Effect, Match, Option } from "effect"
import { SqlClient } from "effect/sql"

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
        evaluation: "APPROVED" | "REJECTED",
      ) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.wiki.canEvaluateRevision
          const revision = yield* repository.findRevisionById(revisionId)
          if (Option.isNone(revision)) {
            return yield* new WikiArticleRevisionNotFoundError({ id: revisionId })
          }

          const previous = yield* repository.findById(revision.value.wikiArticleId)

          if (evaluation === "APPROVED") {
            const stored = yield* repository.findCrdtRowById(revision.value.wikiArticleId)
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
              evaluation,
              evaluatedById: session.personId,
            },
            { enrichment: "skip" },
          )

          return evaluation === "APPROVED"
            ? {
                article: yield* getPublishedArticle(revision.value.wikiArticleId),
                previous: Option.getOrUndefined(previous),
              }
            : undefined
        }).pipe(
          sql.withTransaction,
          Effect.tap((updated) =>
            updated && evaluation === "APPROVED"
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
            resolvedAttributes:
              page.value.kind === "PLANT_CULTIVAR"
                ? Option.some(yield* resolveCultivar(page.value.attributes))
                : Option.none(),
          }
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

      return {
        createWikiArticle,
        createRevision,
        evaluateRevision,
        getPage,
        resolveCultivar,
        getPublishedArticle,
        listCards: repository.listCards,
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
        bookmark: (wikiArticleId: WikiArticleId, state: BookmarkState = "INTERESTED") =>
          Effect.gen(function* () {
            const session = yield* assertAuthenticated
            yield* Policies.wiki.canBookmark
            yield* getPublishedArticle(wikiArticleId)
            yield* repository.setBookmark({ personId: session.personId, wikiArticleId, state })
          }),
        removeBookmark: (wikiArticleId: WikiArticleId) =>
          Effect.gen(function* () {
            const session = yield* assertAuthenticated
            yield* Policies.wiki.canRemoveBookmark(session.personId)
            yield* repository.removeBookmark({ personId: session.personId, wikiArticleId })
          }),
        listBookmarks: assertAuthenticated.pipe(
          Effect.flatMap((session) => repository.listBookmarks(session.personId)),
        ),
      }
    }),
  },
) {}
