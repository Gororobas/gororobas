import {
  BookExternalDataResult,
  BookmarkState,
  LoroDocUpdate,
  PlantExternalDataResult,
  RevisionEvaluation,
  SupportedLanguage,
  TiptapDocument,
  WikiArticleCrdt,
  WikiArticleEditableData,
  WikiArticleEditableTranslation,
  WikiArticleStatus,
  snapshotToLoroDoc,
  type PersonId,
  type WikiArticleKind,
  type WikiArticleRevisionId,
} from "@gororobas/domain"
import {
  Array as EffectArray,
  DateTime,
  Duration,
  Effect,
  Number as EffectNumber,
  Option,
  Order,
  Random,
  Result,
  Schema,
} from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { persistBook } from "../wiki/external-data/kinds/book-persister.js"
import { persistPlant } from "../wiki/external-data/kinds/plant-persister.js"
import { buildExternalDataRequest } from "../wiki/external-data/persist-utils.js"
import { WikiArticlesRepository } from "../wiki/repository.js"
import { richTextDocument, type Mention } from "./rich-text.js"
import {
  activePeople,
  mentionsFor,
  reviewers,
  trustedPeople,
  type SeededArticle,
  type SeededPerson,
  type SeedContext,
} from "./seed-context.js"
import { chance, digits, nanoId, pick, pickOption, pickWeighted, sample } from "./seed-random.js"
import {
  articleNames,
  encodedAttributes,
  legibleAttributes,
  legibleTranslations,
} from "./seed-wiki-content.js"
import { MEDIA_CATEGORIES, PUBLISHERS, REJECTION_REASONS } from "./vocabulary.js"

const ArticleJson = Schema.toCodecJson(WikiArticleEditableData)
const TranslationJson = Schema.toCodecJson(WikiArticleEditableTranslation)
const DocumentJson = Schema.toCodecJson(TiptapDocument)

type ArticleSchema = (typeof WikiArticleEditableData.members)[number]

/**
 * Relative frequency of each kind. Kinds missing here default to 1, so a kind added to
 * the domain is seeded as soon as it has names in the vocabulary.
 */
const KIND_WEIGHTS: Partial<Record<WikiArticleKind, number>> = { PLANT: 8, PLANT_CULTIVAR: 3 }

const sum = (counts: ReadonlyArray<number>) => counts.reduce(EffectNumber.sum, 0)

const mediaSelection = (
  context: Pick<SeedContext, "media">,
  input: { author: SeededPerson; at: number; count: readonly [number, number] },
) =>
  Effect.gen(function* () {
    const selected = Effect.gen(function* () {
      const mediaAssetId = yield* context.media.create({
        ownerProfileId: input.author.id,
        at: input.at,
        creditablePeople: [input.author.id],
      })

      return {
        mediaAssetId,
        ...((yield* chance(0.5)) ? { category: yield* pick(MEDIA_CATEGORIES) } : {}),
      }
    })

    return yield* Effect.replicateEffect(selected, yield* Random.nextIntBetween(...input.count), {
      concurrency: 1,
    })
  })

const seedArticle = (
  context: Pick<SeedContext, "timeline" | "media" | "people" | "organizations">,
  input: {
    kind: WikiArticleKind
    index: number
    structure: WikiArticleEditableData
    parent: SeededArticle | undefined
    concepts: ReadonlyArray<SeededArticle>
  },
) =>
  Effect.gen(function* () {
    const { timeline } = context
    const wiki = yield* WikiArticlesRepository
    const { kind, parent } = input
    // A published first article per kind, with external identifiers, lets even `tiny` seeds
    // cover every table instead of depending on random draws.
    const isRepresentative = input.index === 0

    const { names, subject } = articleNames({
      kind,
      index: input.index,
      parent: parent?.plant ? { plant: parent.plant, names: parent.names } : undefined,
    })

    const encoded = yield* Schema.encodeEffect(ArticleJson)(input.structure).pipe(Effect.orDie)

    const wikiArticle = yield* Schema.decodeEffect(ArticleJson)({
      kind,
      attributes: yield* legibleAttributes(encodedAttributes(encoded), {
        subject,
        conceptIds: input.concepts.map((concept) => concept.id),
        parentPlantId: parent?.id,
        isRepresentative,
      }),
      translations: yield* legibleTranslations({ names, subject, mentions: mentionsFor(context) }),
    }).pipe(Effect.orDie)

    const status = isRepresentative
      ? "PUBLISHED"
      : yield* pickWeighted(WikiArticleStatus.literals, {
          PUBLISHED: 85,
          PENDING_APPROVAL: 10,
          ARCHIVED: 5,
        })

    // Newcomers' articles await approval; trusted people publish directly.
    const isPendingApproval = status === "PENDING_APPROVAL"
    const newcomers = context.people.filter((person) => person.accessLevel === "NEWCOMER")
    const author =
      (isPendingApproval ? yield* pickOption(newcomers) : undefined) ??
      (yield* pickOption(trustedPeople(context)))
    if (!author) return []

    const createdAt = yield* timeline.between(author.joinedAt)
    const mediaAssets = (yield* chance(0.2))
      ? yield* mediaSelection(context, { author, at: createdAt, count: [1, 2] })
      : undefined

    const id = yield* timeline.at(createdAt)(
      wiki.createWikiArticle(
        { wikiArticle, createdById: author.id, status, ...(mediaAssets ? { mediaAssets } : {}) },
        { enrichment: "skip", isPendingApproval },
      ),
    )

    if (status === "PUBLISHED" && (yield* chance(0.5))) {
      const attached = yield* mediaSelection(context, { author, at: createdAt, count: [1, 3] })

      yield* timeline.at(createdAt)(
        Effect.forEach(
          attached,
          ({ mediaAssetId }, position) =>
            Effect.gen(function* () {
              yield* wiki.attachMediaToWikiArticle({ wikiArticleId: id, mediaAssetId })
              if (position === 0) yield* wiki.setMainMedia({ wikiArticleId: id, mediaAssetId })
            }),
          { concurrency: 1, discard: true },
        ),
      )
    }

    return [{ id, kind, names, plant: subject.plant, status, createdAt } satisfies SeededArticle]
  })

const seedKind = (
  context: Pick<SeedContext, "timeline" | "media" | "people" | "organizations">,
  input: { member: ArticleSchema; count: number; earlier: ReadonlyArray<SeededArticle> },
) =>
  Effect.gen(function* () {
    const kind = input.member.fields.kind.literal
    const plants = input.earlier.filter((article) => article.kind === "PLANT" && article.plant)

    // Derive kind-specific attribute shapes from the domain schema itself.
    const structures = yield* Arbitrary.sampleEffect(Arbitrary.schema(input.member), {
      count: input.count,
      seed: yield* Random.nextInt,
      size: 4,
    }).pipe(Effect.orDie)

    const isConcept = (article: SeededArticle) =>
      article.kind === "CONCEPT" && article.status === "PUBLISHED"

    // Concepts created earlier in this kind are referenceable too, so concepts can relate to each other.
    return yield* Effect.reduce(
      structures.map((structure, index) => ({ structure, index })),
      (): ReadonlyArray<SeededArticle> => [],
      (created, { structure, index }) =>
        Effect.gen(function* () {
          const parent = kind === "PLANT_CULTIVAR" ? yield* pickOption(plants) : undefined
          if (kind === "PLANT_CULTIVAR" && !parent) return created
          const concepts = [...input.earlier, ...created].filter(isConcept)
          const article = yield* seedArticle(context, { kind, index, structure, parent, concepts })
          return [...created, ...article]
        }),
    )
  })

export const seedWikiArticles = (
  context: Pick<SeedContext, "timeline" | "media" | "people" | "organizations">,
  input: { count: number },
) => {
  const weight = (member: ArticleSchema) => KIND_WEIGHTS[member.fields.kind.literal] ?? 1
  const totalWeight = sum(WikiArticleEditableData.members.map(weight))

  // Other kinds reference concepts, so concepts go first; cultivars reference plants, so they go last.
  const seedingOrder = (member: ArticleSchema) => {
    const kind = member.fields.kind.literal
    return kind === "CONCEPT" ? 0 : kind === "PLANT_CULTIVAR" ? 2 : 1
  }
  const members = EffectArray.sort(
    WikiArticleEditableData.members,
    Order.mapInput(Order.Number, seedingOrder),
  )

  return Effect.reduce(
    members,
    (): ReadonlyArray<SeededArticle> => [],
    (earlier, member) =>
      Effect.map(
        seedKind(context, {
          member,
          count: Math.max(1, Math.round((input.count * weight(member)) / totalWeight)),
          earlier,
        }),
        (created) => [...earlier, ...created],
      ),
  )
}

const revisionUpdate = (input: {
  article: SeededArticle
  language: SupportedLanguage
  mentions: ReadonlyArray<Mention>
}) =>
  Effect.gen(function* () {
    const wiki = yield* WikiArticlesRepository
    const stored = yield* wiki.findCrdtRowById(input.article.id)
    if (Option.isNone(stored)) return Option.none<LoroDocUpdate>()

    const original = snapshotToLoroDoc(stored.value.crdtSnapshot)
    const changed = original.fork()

    const content = yield* richTextDocument({
      language: input.language,
      paragraphs: [1, 4],
      mentions: input.mentions,
      long: true,
    })

    if (changed.getMap("translations").get(input.language) === undefined) {
      yield* WikiArticleCrdt.applyEdit(changed, {
        _tag: "AddedWikiArticleTranslation",
        language: input.language,
        value: yield* Schema.decodeEffect(TranslationJson)({
          commonNames: [
            {
              id: yield* nanoId,
              name: input.article.names[input.language],
              grammaticalGender: null,
            },
          ],
          content: yield* Schema.encodeEffect(DocumentJson)(content),
        }),
      })
    } else {
      yield* WikiArticleCrdt.applyEdit(changed, {
        _tag: "SetWikiArticleTranslationContent",
        language: input.language,
        content,
      })
    }

    changed.commit()
    return Option.some(
      LoroDocUpdate.make(changed.export({ mode: "update", from: original.version() })),
    )
  }).pipe(Effect.orDie)

const evaluate = (input: {
  revisionId: WikiArticleRevisionId
  evaluator: PersonId
  evaluation: "APPROVED" | "REJECTED"
}) =>
  Effect.gen(function* () {
    const wiki = yield* WikiArticlesRepository

    yield* wiki.evaluateRevision(
      {
        revisionId: input.revisionId,
        evaluatedById: input.evaluator,
        evaluation: input.evaluation,
        ...(input.evaluation === "REJECTED"
          ? { evaluationReason: yield* pick(REJECTION_REASONS) }
          : {}),
      },
      { enrichment: "skip" },
    )
  })

/** Approves the initial revision of an article awaiting approval, publishing it. */
const approvePendingArticle = (
  context: Pick<SeedContext, "timeline">,
  input: { article: SeededArticle; evaluator: SeededPerson },
) =>
  Effect.gen(function* () {
    const wiki = yield* WikiArticlesRepository
    const [initial] = yield* wiki.listRevisionHistory({ wikiArticleId: input.article.id })
    if (!initial) return

    yield* context.timeline.at(yield* context.timeline.between(input.article.createdAt))(
      evaluate({ revisionId: initial.id, evaluator: input.evaluator.id, evaluation: "APPROVED" }),
    )
  })

const seedRevision = (
  context: SeedContext,
  input: { article: SeededArticle; createdAt: number; evaluator: SeededPerson },
) =>
  Effect.gen(function* () {
    const wiki = yield* WikiArticlesRepository
    const { article, createdAt } = input
    const editor = yield* pickOption(activePeople(context))
    if (!editor) return 0

    const crdtUpdate = yield* revisionUpdate({
      article,
      language: yield* pick(SupportedLanguage.literals),
      mentions: mentionsFor(context),
    })

    if (Option.isNone(crdtUpdate)) return 0

    const mediaAssets = (yield* chance(0.25))
      ? yield* mediaSelection(context, { author: editor, at: createdAt, count: [1, 2] })
      : undefined

    const revisionId = yield* context.timeline.at(createdAt)(
      wiki.createRevision({
        wikiArticleId: article.id,
        createdById: editor.id,
        crdtUpdate: crdtUpdate.value,
        ...(mediaAssets ? { mediaAssets } : {}),
      }),
    )

    const evaluation = yield* pickWeighted(RevisionEvaluation.literals, {
      APPROVED: 6,
      REJECTED: 2,
      PENDING: 2,
    })

    if (evaluation !== "PENDING") {
      const hours = yield* Random.nextIntBetween(1, 72)
      yield* context.timeline.at(createdAt + Duration.toMillis(Duration.hours(hours)))(
        evaluate({ revisionId, evaluator: input.evaluator.id, evaluation }),
      )
    }

    return 1
  })

/** Pending, approved and rejected revisions, including approvals of pending articles. */
export const seedWikiRevisions = (context: SeedContext) =>
  Effect.gen(function* () {
    const evaluators = reviewers(context)

    const counts = yield* Effect.forEach(
      context.articles,
      (article) =>
        Effect.gen(function* () {
          const evaluator = yield* pickOption(evaluators)
          if (!evaluator) return 0

          if (article.status === "PENDING_APPROVAL") {
            if (yield* chance(0.5)) yield* approvePendingArticle(context, { article, evaluator })
            return 0
          }

          if (article.status !== "PUBLISHED" || !(yield* chance(0.3))) return 0

          const times = yield* Effect.replicateEffect(
            context.timeline.between(article.createdAt),
            yield* Random.nextIntBetween(1, 3),
            { concurrency: 1 },
          )

          return sum(
            yield* Effect.forEach(
              EffectArray.sort(times, Order.Number),
              (createdAt) => seedRevision(context, { article, createdAt, evaluator }),
              { concurrency: 1 },
            ),
          )
        }),
      { concurrency: 1 },
    )

    return sum(counts)
  })

export const seedBookmarks = (context: Pick<SeedContext, "people" | "articles">) =>
  Effect.gen(function* () {
    const wiki = yield* WikiArticlesRepository
    const published = context.articles.filter((article) => article.status === "PUBLISHED")

    const counts = yield* Effect.forEach(
      activePeople(context),
      (person) =>
        Effect.gen(function* () {
          const bookmarked = yield* sample(published, yield* Random.nextIntBetween(0, 12))

          yield* Effect.forEach(
            bookmarked,
            (article) =>
              Effect.gen(function* () {
                yield* wiki.setBookmark({
                  personId: person.id,
                  wikiArticleId: article.id,
                  state: yield* pick(BookmarkState.literals),
                })
              }),
            { concurrency: 1, discard: true },
          )

          return bookmarked.length
        }),
      { concurrency: 1 },
    )

    return sum(counts)
  })

const plantExternalData = (article: SeededArticle, wikidataId: string) =>
  Effect.gen(function* () {
    const plant = article.plant
    if (!plant) return undefined

    const [genus = plant.scientificName] = plant.scientificName.split(" ")
    const taxonId = digits(7)

    return PlantExternalDataResult.make({
      kind: "PLANT",
      attributes: {
        wikidata: Result.succeed({
          observation: {
            provider: "WIKIDATA",
            externalId: wikidataId,
            sourceUrl: `https://www.wikidata.org/wiki/${wikidataId}`,
            fetchedAt: DateTime.formatIso(yield* DateTime.now),
            payload: {},
          },
          gbifId: { kind: "taxon", id: yield* taxonId },
          wikipediaLinks: SupportedLanguage.literals.map((language) => ({
            language,
            url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(plant.names[language].replaceAll(" ", "_"))}`,
          })),
        }),
        gbif: Result.succeed({
          observations: [],
          gbifTaxonId: yield* taxonId,
          taxonomyGroup: plant.family,
          classification: [
            { taxonId: yield* taxonId, scientificName: "Plantae", taxonRank: "KINGDOM" },
            { taxonId: yield* taxonId, scientificName: plant.family, taxonRank: "FAMILY" },
            { taxonId: yield* taxonId, scientificName: genus, taxonRank: "GENUS" },
            { taxonId: yield* taxonId, scientificName: plant.scientificName, taxonRank: "SPECIES" },
          ],
          media: [],
        }),
      },
    })
  })

const bookExternalData = (article: SeededArticle, volumeId: string) =>
  Effect.gen(function* () {
    return BookExternalDataResult.make({
      kind: "BOOK",
      attributes: {
        googleBooks: Result.succeed({
          observations: [],
          coverage: "COMPLETE",
          editions: [
            {
              externalId: volumeId,
              title: article.names.pt,
              publisher: yield* pick(PUBLISHERS),
              publicationDate: String(yield* Random.nextIntBetween(1985, 2025)),
              pageCount: yield* Random.nextIntBetween(80, 600),
              languages: ["pt"],
              isbn: [`978${yield* digits(10)}`],
              sourceUrl: `https://books.google.com/books?id=${volumeId}`,
            },
          ],
        }),
      },
    })
  })

const enrichArticle = (article: SeededArticle) =>
  Effect.gen(function* () {
    const wiki = yield* WikiArticlesRepository
    const row = yield* wiki.findById(article.id)
    if (Option.isNone(row)) return 0

    const request = buildExternalDataRequest(row.value)

    if (row.value.kind === "PLANT" && Option.isSome(row.value.attributes.wikidataId)) {
      const result = yield* plantExternalData(article, row.value.attributes.wikidataId.value)
      if (!result) return 0
      yield* persistPlant(request, result)
      return 1
    }

    if (row.value.kind === "BOOK" && Option.isSome(row.value.attributes.googleBooksVolumeId)) {
      const volumeId = row.value.attributes.googleBooksVolumeId.value
      yield* persistBook(request, yield* bookExternalData(article, volumeId))
      return 1
    }

    return 0
  })

/**
 * Provider data normally arrives through the enrichment workflow. Seeding persists
 * synthetic provider results through the same persisters, without network access.
 */
export const seedExternalData = (context: Pick<SeedContext, "articles">) =>
  Effect.map(
    Effect.forEach(
      context.articles.filter((article) => article.status === "PUBLISHED"),
      enrichArticle,
      { concurrency: 1 },
    ),
    sum,
  )
