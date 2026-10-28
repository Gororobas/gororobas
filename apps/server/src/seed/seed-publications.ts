import {
  ContentLanguage,
  EventAttendanceMode,
  EventSourceData,
  LoroDocUpdate,
  PostSourceData,
  PublicationCrdt,
  PublicationKind,
  PublicationVisibility,
  SupportedLanguage,
  SystemCommit,
  snapshotToLoroDoc,
  tiptapToText,
  type ProfileId,
  type PublicationCommentId,
  type PublicationId,
  type TiptapDocument,
} from "@gororobas/domain"
import {
  Array as EffectArray,
  DateTime,
  Duration,
  Effect,
  Number as EffectNumber,
  Option,
  Random,
  Schema,
} from "effect"

import { updateModerationStatus } from "../moderation/moderate-content.js"
import { PublicationCommentsRepository } from "../publication-comments/repository.js"
import {
  attachMediaToPublication,
  replacePublicationWikiArticleLinks,
} from "../publications/mutations.js"
import {
  HumanCrdtUpdate,
  SystemUpsertTranslation,
} from "../publications/publication-repository-inputs.js"
import { findPublicationCrdtSnapshotById } from "../publications/queries.js"
import { PublicationsRepository } from "../publications/repository.js"
import { firstParagraphEvidence, richTextDocument } from "./rich-text.js"
import {
  activePeople,
  referencesFor,
  type SeededPerson,
  type SeededPublication,
  type SeedContext,
} from "./seed-context.js"
import { makeHandleRegistry, type HandleRegistry } from "./seed-people.js"
import { chance, pick, pickOption, pickWeighted, sample } from "./seed-random.js"
import { PLACES } from "./vocabulary.js"

/** Translations written by the seed are attributed to the translation workflow. */
const SEED_TRANSLATION_COMMIT = SystemCommit.make({
  workflowName: "PublicationTranslationWorkflow",
  workflowVersion: "seed",
  model: "seed",
})

const SOURCE_LANGUAGES = ["pt", "es", "en", "und"] as const

const minutes = (count: number) => Duration.toMillis(Duration.minutes(count))

const sampleUpTo = <A>(items: ReadonlyArray<A>, range: readonly [min: number, max: number]) =>
  Effect.flatMap(Random.nextIntBetween(...range), (count) => sample(items, count))

/** Who writes a publication: a person for themselves, or an editor for an organization. */
const chooseAuthorship = (context: Pick<SeedContext, "people" | "organizations">) =>
  Effect.gen(function* () {
    const organization = (yield* chance(0.15))
      ? yield* pickOption(context.organizations)
      : undefined
    const editors = organization?.members.filter((member) => member.accessLevel !== "VIEWER") ?? []
    const editor = yield* pickOption(editors)
    const author = editor
      ? context.people.find((person) => person.id === editor.personId)
      : yield* pickOption(activePeople(context))

    if (!author) return undefined

    return {
      author,
      ownerProfileId: organization && editor ? organization.id : author.id,
      since: Math.max(author.joinedAt, organization && editor ? organization.createdAt : 0),
    } satisfies { author: SeededPerson; ownerProfileId: ProfileId; since: number }
  })

const decodeLanguage = Schema.decodeEffect(ContentLanguage)

const sourceData = (input: {
  kind: PublicationKind
  createdAt: number
  sourceLanguage: (typeof SOURCE_LANGUAGES)[number]
  content: TiptapDocument
}) =>
  Effect.gen(function* () {
    const sourceLanguage = yield* decodeLanguage(input.sourceLanguage)
    const translations =
      input.sourceLanguage === "und" ? {} : { [input.sourceLanguage]: "original" as const }

    if (input.kind === "POST") {
      return PostSourceData.make({
        sourceContent: input.content,
        sourceLanguage,
        translations,
        metadata: { kind: "POST" },
      })
    }

    const startDate =
      input.createdAt + Duration.toMillis(Duration.days(yield* Random.nextIntBetween(3, 120)))
    const attendanceMode = (yield* chance(0.9)) ? yield* pick(EventAttendanceMode.literals) : null

    return EventSourceData.make({
      sourceContent: input.content,
      sourceLanguage,
      translations,
      metadata: {
        kind: "EVENT",
        startDate: DateTime.makeUnsafe(startDate),
        endDate: (yield* chance(0.7))
          ? DateTime.makeUnsafe(
              startDate + Duration.toMillis(Duration.hours(yield* Random.nextIntBetween(2, 8))),
            )
          : null,
        locationOrUrl:
          attendanceMode === "VIRTUAL"
            ? "https://meet.example.org/gororobas"
            : (yield* chance(0.9))
              ? yield* pick(PLACES)
              : null,
        attendanceMode,
      },
    })
  })

const currentFrontier = (publicationId: PublicationId) =>
  Effect.gen(function* () {
    const row = yield* (yield* PublicationsRepository).findPublicationRowById(publicationId)
    if (Option.isNone(row)) {
      return yield* Effect.die(`Seeded publication ${publicationId} is missing`)
    }
    return row.value.currentCrdtFrontier
  })

const translatePublication = (input: {
  publicationId: PublicationId
  sourceLanguage: SupportedLanguage
}) =>
  Effect.gen(function* () {
    const repository = yield* PublicationsRepository
    const targets = yield* sampleUpTo(
      SupportedLanguage.literals.filter((language) => language !== input.sourceLanguage),
      [1, 2],
    )

    yield* Effect.forEach(
      targets,
      (targetLanguage) =>
        Effect.gen(function* () {
          const frontier = yield* currentFrontier(input.publicationId)

          yield* repository.updatePublication(
            SystemUpsertTranslation.make({
              commit: SEED_TRANSLATION_COMMIT,
              publicationId: input.publicationId,
              sourceLanguage: yield* decodeLanguage(input.sourceLanguage),
              sourceCrdtFrontier: frontier,
              targetLanguage,
              translatedContent: yield* richTextDocument({
                language: targetLanguage,
                paragraphs: [1, 4],
              }),
            }),
          )
        }),
      { concurrency: 1, discard: true },
    )
  })

const editPublication = (input: {
  publicationId: PublicationId
  author: SeededPerson
  content: TiptapDocument
}) =>
  Effect.gen(function* () {
    const repository = yield* PublicationsRepository
    const stored = yield* findPublicationCrdtSnapshotById(input.publicationId)
    if (Option.isNone(stored)) return

    const current = snapshotToLoroDoc(stored.value.crdtSnapshot)
    const edited = current.fork()
    yield* PublicationCrdt.applyEdit(edited, {
      _tag: "SetPublicationSourceContent",
      content: input.content,
    }).pipe(Effect.orDie)

    yield* repository.updatePublication(
      HumanCrdtUpdate.make({
        authorId: input.author.id,
        crdtUpdate: LoroDocUpdate.make(edited.export({ from: current.version(), mode: "update" })),
        expectedCurrentCrdtFrontier: yield* currentFrontier(input.publicationId),
        publicationId: input.publicationId,
      }),
    )
  })

/** Stands in for the link inference workflow, which the seed doesn't submit. */
const linkInferredArticles = ({
  context,
  publicationId,
  source,
}: {
  context: Pick<SeedContext, "articles">
  publicationId: PublicationId
  source: { readonly language: ContentLanguage; readonly content: TiptapDocument }
}) =>
  Effect.gen(function* () {
    const evidence = firstParagraphEvidence(["sourceContent"], source.content)
    if (Option.isNone(evidence)) return

    const published = context.articles.filter((article) => article.status === "PUBLISHED")
    const concepts = yield* sampleUpTo(
      published.filter((article) => article.kind === "CONCEPT"),
      [1, 3],
    )
    const others = yield* sampleUpTo(
      published.filter((article) => article.kind !== "CONCEPT"),
      [0, 3],
    )

    yield* replacePublicationWikiArticleLinks({
      publicationId,
      source: "MENTION",
      rows: others.map((article) => ({
        publicationId,
        wikiArticleId: article.id,
        source: "MENTION",
        evidence: [{ ...evidence.value, text: article.names.pt }],
      })),
    })

    yield* replacePublicationWikiArticleLinks({
      publicationId,
      source: "INFERENCE",
      rows: concepts.map((article) => ({
        publicationId,
        wikiArticleId: article.id,
        source: "INFERENCE",
        evidence: [
          {
            ...evidence.value,
            rationale: `The passage describes practices related to ${article.names.en}.`,
          },
        ],
      })),
    })
  })

/** Rich text opens with a sentence; its first words make a readable handle. */
const handleBase = (content: TiptapDocument) =>
  tiptapToText(content).split(/\s+/).filter(Boolean).slice(0, 6).join(" ")

const seedPublication = (
  context: Pick<
    SeedContext,
    "timeline" | "media" | "people" | "organizations" | "articles" | "publications"
  >,
  handles: HandleRegistry,
) =>
  Effect.gen(function* () {
    const { timeline } = context
    const repository = yield* PublicationsRepository
    const authorship = yield* chooseAuthorship(context)
    if (!authorship) return []

    const { author, ownerProfileId } = authorship
    const createdAt = yield* timeline.between(authorship.since)
    const kind = yield* pickWeighted(PublicationKind.literals, { POST: 3, EVENT: 1 })
    const sourceLanguage = yield* pickWeighted(SOURCE_LANGUAGES, { pt: 70, es: 15, en: 12, und: 3 })
    const textLanguage = sourceLanguage === "und" ? "pt" : sourceLanguage

    const media = (yield* chance(0.3))
      ? yield* Effect.replicateEffect(
          context.media.create({ ownerProfileId, at: createdAt, creditablePeople: [author.id] }),
          yield* Random.nextIntBetween(1, 4),
          { concurrency: 1 },
        )
      : []

    const content = yield* richTextDocument({
      language: textLanguage,
      paragraphs: [1, 6],
      references: referencesFor(context),
      media,
      long: true,
    })

    const handle = yield* handles(handleBase(content))

    const visibility = yield* pickWeighted(PublicationVisibility.literals, {
      PUBLIC: 3,
      COMMUNITY: 1,
    })

    const data = yield* sourceData({
      kind,
      createdAt,
      sourceLanguage,
      content,
    })

    const publicationId = yield* timeline.at(createdAt)(
      Effect.gen(function* () {
        const publicationId = yield* repository.createPublication({
          handle,
          ownerProfileId,
          publishedAt: DateTime.makeUnsafe(createdAt),
          visibility,
          sourceData: data,
          createdById: author.id,
        })

        yield* Effect.forEach(
          media,
          (mediaAssetId) => attachMediaToPublication({ publicationId, mediaAssetId }),
          { concurrency: 1, discard: true },
        )

        if (yield* chance(0.6)) {
          yield* linkInferredArticles({
            context,
            publicationId,
            source: { language: data.sourceLanguage, content: data.sourceContent },
          })
        }

        return publicationId
      }),
    )

    if (sourceLanguage !== "und" && (yield* chance(0.4))) {
      yield* timeline.at(createdAt + minutes(10))(
        translatePublication({ publicationId, sourceLanguage }),
      )
    }

    if (yield* chance(0.2)) {
      const editedAt = yield* timeline.between(createdAt + minutes(60))

      const edited = yield* richTextDocument({
        language: textLanguage,
        paragraphs: [1, 5],
        long: true,
      })

      yield* timeline.at(editedAt)(editPublication({ publicationId, author, content: edited }))
    }

    // A few publications are censored, some of them later reapproved.
    if (yield* chance(0.03)) {
      const censoredAt = yield* timeline.between(createdAt + minutes(30))
      const moderationStatus = (yield* chance(0.3)) ? "REAPPROVED_AFTER_CENSORING" : "CENSORED"

      yield* timeline.at(censoredAt)(
        Effect.flatMap(DateTime.now, (updatedAt) =>
          updateModerationStatus({
            contentType: "PUBLICATION",
            id: publicationId,
            moderationStatus,
            updatedAt,
          }),
        ),
      )
    }

    return [
      {
        id: publicationId,
        handle,
        ownerProfileId,
        visibility,
        createdAt,
      } satisfies SeededPublication,
    ]
  })

export const seedPublications = (
  context: Pick<SeedContext, "timeline" | "media" | "people" | "organizations" | "articles">,
  input: { count: number },
) => {
  const handles = makeHandleRegistry()

  // Later publications may reference earlier ones in their content.
  return Effect.reduce(
    EffectArray.makeBy(input.count, (index) => index),
    (): ReadonlyArray<SeededPublication> => [],
    (publications) =>
      Effect.map(seedPublication({ ...context, publications }, handles), (created) => [
        ...publications,
        ...created,
      ]),
  )
}

interface SeededComment {
  readonly id: PublicationCommentId
  readonly createdAt: number
}

const seedComment = (
  context: Pick<SeedContext, "timeline" | "people" | "organizations">,
  input: { publication: SeededPublication; thread: ReadonlyArray<SeededComment> },
) =>
  Effect.gen(function* () {
    const { timeline } = context
    const comments = yield* PublicationCommentsRepository
    const author = yield* pickOption(activePeople(context))
    if (!author) return undefined

    const parent = (yield* chance(0.3)) ? yield* pickOption(input.thread) : undefined

    const organization = (yield* chance(0.05))
      ? context.organizations.find((candidate) =>
          candidate.members.some((member) => member.personId === author.id),
        )
      : undefined

    const createdAt = yield* timeline.between(
      Math.max(input.publication.createdAt, parent?.createdAt ?? 0, author.joinedAt),
    )
    const language = yield* pickWeighted(SupportedLanguage.literals, { pt: 7, es: 2, en: 1 })

    const id = yield* timeline.at(createdAt)(
      comments.createPublicationComment({
        createdById: author.id,
        ownerProfileId: organization?.id ?? author.id,
        parentPublicationCommentId: parent?.id ?? null,
        publicationId: input.publication.id,
        sourceData: {
          sourceContent: yield* richTextDocument({ language, paragraphs: [1, 2] }),
          sourceLanguage: yield* decodeLanguage(language),
        },
      }),
    )

    const currentRevision = Effect.flatMap(comments.findPublicationCommentRowById(id), (row) =>
      Option.isSome(row)
        ? Effect.succeed(row.value.currentRevisionId)
        : Effect.die(`Seeded comment ${id} is missing`),
    )

    if (yield* chance(0.15)) {
      yield* timeline.at(yield* timeline.between(createdAt))(
        comments.updatePublicationComment({
          publicationCommentId: id,
          expectedCurrentRevisionId: yield* currentRevision,
          sourceContent: yield* richTextDocument({ language, paragraphs: [1, 2] }),
          authorId: author.id,
        }),
      )
    }

    if (yield* chance(0.25)) {
      const targets = yield* sampleUpTo(
        SupportedLanguage.literals.filter((candidate) => candidate !== language),
        [1, 2],
      )

      yield* timeline.at(createdAt + minutes(5))(
        comments.upsertPublicationCommentTranslations({
          publicationCommentId: id,
          sourceRevisionId: yield* currentRevision,
          translations: yield* Effect.forEach(
            targets,
            (target) =>
              Effect.map(richTextDocument({ language: target, paragraphs: [1, 2] }), (content) => ({
                language: target,
                content,
              })),
            { concurrency: 1 },
          ),
        }),
      )
    }

    if (yield* chance(0.04)) {
      yield* timeline.at(yield* timeline.between(createdAt))(
        Effect.flatMap(DateTime.now, (updatedAt) =>
          updateModerationStatus({
            contentType: "PUBLICATION_COMMENT",
            id,
            moderationStatus: "CENSORED",
            updatedAt,
          }),
        ),
      )
    }

    return { id, createdAt } satisfies SeededComment
  })

const COMMENT_COUNTS = [0, 0, 1, 1, 2, 2, 3, 4, 6] as const

export const seedComments = (
  context: Pick<SeedContext, "timeline" | "people" | "organizations" | "publications">,
) =>
  Effect.map(
    Effect.forEach(
      context.publications,
      (publication) =>
        Effect.gen(function* () {
          // Replies pick their parent among the publication's earlier comments.
          const thread = yield* Effect.reduce(
            EffectArray.makeBy(yield* pick(COMMENT_COUNTS), (index) => index),
            (): ReadonlyArray<SeededComment> => [],
            (earlier) =>
              Effect.map(seedComment(context, { publication, thread: earlier }), (comment) =>
                comment ? [...earlier, comment] : earlier,
              ),
          )

          return thread.length
        }),
      { concurrency: 1 },
    ),
    (counts) => counts.reduce(EffectNumber.sum, 0),
  )
