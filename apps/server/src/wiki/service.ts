import {
  assertAuthenticated,
  BookmarkState,
  CreateWikiArticlePayload,
  CreateWikiArticleRevisionPayload,
  EvaluateWikiArticleRevisionPayload,
  InvalidCrdtUpdateError,
  MediaAssetId,
  type GazetteerPlace,
  MediaNotFoundError,
  PlaceMap,
  PlaceOutline,
  Policies,
  SupportedLanguage,
  WikiArticleId,
  WikiArticleLookup,
  WikiArticleNotFoundError,
  WikiArticleRevisionId,
  type WhosOnFirstId,
  type PlantCultivarProjectedAttributes,
  type WikiArticleQueriedPageData,
  type WikiArticleQueriedPageRow,
  WikiChildPlacesPage,
  type WikiChildPlacesParams,
  type WikiMediaSelection,
  WikiPlacePageData,
  WikiPlantCultivarPageData,
  type WikiSearchParams,
} from "@gororobas/domain"
import { Array as EffectArray, Context, DateTime, Effect, Match, Option } from "effect"
import { SqlClient } from "effect/sql"

import { Enrichment } from "../enrichment/enrichment.js"
import { MediaAssetsRepository } from "../media-assets/repository.js"
import { MediaAssetsService } from "../media-assets/service.js"
import { Gazetteer } from "../places/gazetteer.js"
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

type PlantCultivarPageRow = Extract<WikiArticleQueriedPageRow, { kind: "PLANT_CULTIVAR" }>
type PlacePageRow = Extract<WikiArticleQueriedPageRow, { kind: "PLACE" }>

/** @effect-expect-leaking SqlClient */
export class WikiArticlesService extends Context.Service<WikiArticlesService>()(
  "WikiArticlesService",
  {
    make: Effect.gen(function* () {
      const repository = yield* WikiArticlesRepository
      const gazetteer = yield* Gazetteer
      const enrichment = yield* Enrichment
      const media = yield* MediaAssetsService
      const mediaRepository = yield* MediaAssetsRepository
      const sql = yield* SqlClient.SqlClient

      const getPublishedArticle = (id: WikiArticleId) =>
        repository.findPublishedById(id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new WikiArticleNotFoundError({ id })),
              onSome: Effect.succeed,
            }),
          ),
        )

      const validateMediaSelection = (
        selection: WikiMediaSelection | undefined,
        alreadyAttachedIds: ReadonlyArray<MediaAssetId>,
      ) =>
        Effect.forEach(
          selection ?? [],
          ({ mediaAssetId }) =>
            Effect.gen(function* () {
              const asset = yield* media.getMediaForAttachment(mediaAssetId, {
                isAlreadyAttached: alreadyAttachedIds.includes(mediaAssetId),
              })
              if (asset.format !== "IMAGE") return yield* new MediaNotFoundError({ id: asset.id })
            }),
          { concurrency: 1, discard: true },
        )

      const createWikiArticle = (input: CreateWikiArticlePayload) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.wiki.canCreate
          yield* validateMediaSelection(input.mediaAssets, [])

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
          yield* validateMediaSelection(
            input.mediaAssets,
            (yield* repository.listWikiArticleMedia(id)).map((asset) => asset.id),
          )

          return yield* repository.createRevision({
            ...input,
            wikiArticleId: id,
            createdById: session.personId,
          })
        })

      /** The repository validates the approved state in its own transaction, so enrichment reads it committed. */
      const evaluateRevision = (
        revisionId: WikiArticleRevisionId,
        { evaluation, reason }: EvaluateWikiArticleRevisionPayload,
      ) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* Policies.wiki.canEvaluateRevision

          const approved = yield* repository.evaluateRevision({
            revisionId,
            evaluation,
            evaluatedById: session.personId,
            evaluationReason: reason,
          })

          if (Option.isSome(approved)) yield* enrichment.onWikiArticleChanged(approved.value)
        })

      /** The article's own projection, without what its page reads from other articles. */
      const findPage = (lookup: WikiArticleLookup & { language: SupportedLanguage }) =>
        repository.findPageByHandleAndKind(lookup).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new WikiArticleNotFoundError(lookup)),
              onSome: Effect.succeed,
            }),
          ),
        )

      const getPage = (lookup: WikiArticleLookup & { language: SupportedLanguage }) =>
        findPage(lookup).pipe(Effect.flatMap((row) => withKindPageData(row, lookup.language)))

      /** Adds what each kind's page shows from other articles and the gazetteer. */
      const withKindPageData = (row: WikiArticleQueriedPageRow, language: SupportedLanguage) =>
        Match.value(row).pipe(
          Match.discriminator("kind")("PLANT_CULTIVAR", (cultivar) =>
            getPlantCultivarPageData(cultivar, language),
          ),
          Match.discriminator("kind")("PLACE", (place) => getPlacePageData(place, language)),
          Match.orElse((page) => Effect.succeed<WikiArticleQueriedPageData>(page)),
        )

      const getPlantCultivarPageData = (
        cultivar: PlantCultivarPageRow,
        language: SupportedLanguage,
      ) =>
        findParentPlant({ parentPlantId: cultivar.attributes.parentPlantId, language }).pipe(
          Effect.map((parentPlant) => WikiPlantCultivarPageData.make({ ...cultivar, parentPlant })),
        )

      /** Ancestors come from the app's database and the map from the gazetteer's, so they load together. */
      const getPlacePageData = (place: PlacePageRow, language: SupportedLanguage) =>
        Effect.all(
          {
            ancestorPlaces: repository.listAncestorPlaceCards({ placeId: place.id, language }),
            map: Option.match(place.attributes.whosOnFirstId, {
              onNone: () => Effect.succeed(null),
              onSome: (whosOnFirstId) => findPlaceMap({ whosOnFirstId, language }),
            }),
          },
          { concurrency: "unbounded" },
        ).pipe(Effect.map((related) => WikiPlacePageData.make({ ...place, ...related })))

      const toOutline = ({ name, boundingBox, geometry }: GazetteerPlace) =>
        PlaceOutline.make({ name, boundingBox, geometry })

      /** The place's outline inside its closest ancestor's, from the gazetteer. */
      const findPlaceMap = ({
        whosOnFirstId,
        language,
      }: Readonly<{ whosOnFirstId: WhosOnFirstId; language: SupportedLanguage }>) =>
        Effect.gen(function* () {
          const maybePlace = yield* gazetteer.findPlace(whosOnFirstId, language)
          if (Option.isNone(maybePlace)) return null

          const place = maybePlace.value

          const surroundings = yield* Effect.transposeOption(
            Option.map(EffectArray.head(place.ancestors), (ancestor) =>
              gazetteer.findPlace(ancestor.id, language),
            ),
          ).pipe(Effect.map(Option.flatten))

          return PlaceMap.make({
            place: toOutline(place),
            surroundings: Option.map(surroundings, toOutline),
          })
        })

      const findParentPlant = ({
        parentPlantId,
        language,
      }: {
        parentPlantId: WikiArticleId
        language: SupportedLanguage
      }) =>
        Effect.gen(function* () {
          const maybeParent = yield* repository.findPublishedById(parentPlantId)
          const cards = yield* repository.listCardsByIds({
            wikiArticleIds: [parentPlantId],
            language,
          })

          return Option.flatMap(
            Option.all({
              parent: maybeParent,
              card: EffectArray.head(cards),
            }),
            ({ parent, card }) =>
              parent.kind === "PLANT"
                ? Option.some({ card, attributes: parent.attributes })
                : Option.none(),
          )
        })

      /** One page of a place's children, each with its outline from the gazetteer in one lookup. */
      const listChildPlaces = (lookup: WikiArticleLookup & WikiChildPlacesParams) =>
        Effect.gen(function* () {
          const { language, pageSize, currentPage } = lookup
          const page = yield* findPage(lookup)
          if (page.kind !== "PLACE") return WikiChildPlacesPage.make({ places: [], totalCount: 0 })

          const { count } = yield* repository.countChildPlaces({ placeId: page.id, language })

          const rows = yield* repository.listChildPlaceCards({
            placeId: page.id,
            language,
            limit: pageSize,
            offset: pageSize * currentPage,
          })

          const outlines = yield* gazetteer.findPlaces({
            ids: EffectArray.getSomes(rows.map((row) => Option.fromNullishOr(row.whosOnFirstId))),
            language,
          })

          return WikiChildPlacesPage.make({
            totalCount: count,
            places: rows.map(({ whosOnFirstId, ...card }) => {
              const place = whosOnFirstId === null ? undefined : outlines[whosOnFirstId]
              return { card, outline: place === undefined ? null : toOutline(place) }
            }),
          })
        })

      const listRelatedWikiArticles = (
        lookup: WikiArticleLookup & { language: SupportedLanguage },
      ) =>
        Effect.gen(function* () {
          const page = yield* findPage(lookup)
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
        findPage({ ...lookup, language: "pt" }).pipe(
          Effect.flatMap((page) => repository.listBookmarkers(page.id)),
        )

      const listCultivarCards = (lookup: WikiArticleLookup & { language: SupportedLanguage }) =>
        findPage(lookup).pipe(
          Effect.flatMap((page) =>
            page.kind === "PLANT"
              ? repository.listCultivarCards({ parentPlantId: page.id, language: lookup.language })
              : Effect.succeed([]),
          ),
        )

      const listContributors = (lookup: WikiArticleLookup) =>
        findPage({ ...lookup, language: "pt" }).pipe(
          Effect.flatMap((page) => repository.listContributors(page.id)),
        )

      return {
        createWikiArticle,
        createRevision,
        evaluateRevision,
        listRevisionHistory: repository.listRevisionHistory,
        findPage,
        getPage,
        listChildPlaces,
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
