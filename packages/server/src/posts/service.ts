import {
  CrdtCommit,
  CreateEventData,
  CreateNoteData,
  EMPTY_LORO_DOC_FRONTIER,
  type EventData,
  type EventSourceData,
  HumanCommit,
  IdGen,
  type Locale,
  loroDocToSnapshot,
  loroDocToUpdate,
  LoroDocUpdate,
  type NoteData,
  type NoteSourceData,
  nowAsIso,
  PersonId,
  type PostHistoryEntry,
  PostId,
  PostNotFoundError,
  type PostRow,
  type PostTranslationRow,
  ProfileId,
  SystemCommit,
  UpdateNoteData,
} from "@gororobas/domain"
import { DateTime, Effect, Option, Schema, ServiceMap } from "effect"
/**
 * Posts service - business operations for posts.
 *
 * Based on BDD features in test/posts.feature:
 * - Create note/event posts with visibility (PUBLIC/COMMUNITY/PRIVATE)
 * - Edit posts with history tracking
 * - Delete posts
 * - View post history
 */
import { SqlClient } from "effect/unstable/sql"
import { LoroDoc } from "loro-crdt"

import {
  createDocFromEventData,
  createDocFromNoteData,
  editPostDoc,
  importDoc,
} from "./post-crdt.js"
import { PostsRepository } from "./repository.js"

export const CreateNoteInput = Schema.Struct({
  ...CreateNoteData.fields,
  authorId: PersonId,
  ownerProfileId: ProfileId,
})
export type CreateNoteInput = typeof CreateNoteInput.Type

export const CreateEventInput = Schema.Struct({
  ...CreateEventData.fields,
  authorId: PersonId,
  ownerProfileId: ProfileId,
})
export type CreateEventInput = typeof CreateEventInput.Type

export const UpdateNoteInput = Schema.Struct({
  ...UpdateNoteData.fields,
  authorId: PersonId,
  postId: PostId,
})
export type UpdateNoteInput = typeof UpdateNoteInput.Type

const emptyContent: PostTranslationRow["content"] = { content: [], type: "doc", version: 1 } as any

const rowToNoteData = (
  row: PostRow,
  content: PostTranslationRow["content"],
  locale: Locale,
): NoteData => ({
  content,
  createdAt: row.createdAt,
  handle: row.handle,
  id: row.id,
  locale,
  ownerProfileId: row.ownerProfileId,
  publishedAt: row.publishedAt,
  kind: "NOTE",
  updatedAt: row.updatedAt,
  visibility: row.visibility!,
})

const rowToEventData = (
  row: PostRow,
  content: PostTranslationRow["content"],
  locale: Locale,
): EventData => ({
  attendanceMode: row.attendanceMode,
  content,
  createdAt: row.createdAt,
  endDate: row.endDate,
  handle: row.handle,
  id: row.id,
  locale,
  locationOrUrl: row.locationOrUrl,
  ownerProfileId: row.ownerProfileId,
  publishedAt: row.publishedAt,
  startDate: row.startDate!,
  kind: "EVENT",
  updatedAt: row.updatedAt,
  visibility: row.visibility!,
})

export class Posts extends ServiceMap.Service<Posts>()("Posts", {
  make: Effect.gen(function* () {
    const repo = yield* PostsRepository
    const sql = yield* SqlClient.SqlClient

    const createNote = (input: CreateNoteInput) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now
        const postId = yield* IdGen.make(PostId)

        const sourceData: NoteSourceData = {
          locales: {
            pt: {
              content: input.content,
              originalLocale: "pt",
              translationSource: "ORIGINAL",
            },
          },
          metadata: {
            handle: input.handle,
            kind: "NOTE",
            ownerProfileId: input.ownerProfileId,
            publishedAt: now,
            visibility: input.visibility,
          },
        }

        const loroDoc = createDocFromNoteData(sourceData)
        const crdtBlob = loroDocToSnapshot(loroDoc)
        const frontier = loroDoc.frontiers()

        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* repo.insertCrdt({
              createdAt: now,
              id: postId,
              loroCrdt: crdtBlob,
              ownerProfileId: input.ownerProfileId,
              updatedAt: now,
            })

            const commit = HumanCommit.makeUnsafe({ personId: input.authorId })
            yield* repo.insertCommit({
              commit,
              crdtUpdate: loroDocToUpdate(loroDoc),
              fromCrdtFrontier: EMPTY_LORO_DOC_FRONTIER,
              postId,
            })

            yield* repo.materialize({
              currentCrdtFrontier: frontier,
              locales: sourceData.locales,
              metadata: sourceData.metadata,
              ownerProfileId: input.ownerProfileId,
              postId,
            })
          }),
        )

        const row = yield* repo.findById(postId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PostNotFoundError({ id: postId })),
              onSome: Effect.succeed,
            }),
          ),
        )

        const translation = yield* repo
          .findTranslation({ locale: "pt", postId })
          .pipe(Effect.map(Option.getOrNull))

        return rowToNoteData(row, translation?.content ?? emptyContent, "pt")
      })

    const createEvent = (input: CreateEventInput) =>
      Effect.gen(function* () {
        const now = yield* DateTime.now
        const postId = yield* IdGen.make(PostId)

        const sourceData: EventSourceData = {
          locales: {
            pt: {
              content: input.content,
              originalLocale: "pt",
              translationSource: "ORIGINAL",
            },
          },
          metadata: {
            attendanceMode: input.attendanceMode ?? null,
            endDate: input.endDate ?? null,
            handle: input.handle,
            kind: "EVENT",
            locationOrUrl: input.locationOrUrl ?? null,
            ownerProfileId: input.ownerProfileId,
            publishedAt: now,
            startDate: input.startDate,
            visibility: input.visibility,
          },
        }

        const loroDoc = createDocFromEventData(sourceData)
        const crdtBlob = loroDocToSnapshot(loroDoc)
        const frontier = loroDoc.frontiers()

        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* repo.insertCrdt({
              createdAt: now,
              id: postId,
              loroCrdt: crdtBlob,
              ownerProfileId: input.ownerProfileId,
              updatedAt: now,
            })

            const commit = HumanCommit.makeUnsafe({ personId: input.authorId })
            yield* repo.insertCommit({
              commit,
              crdtUpdate: loroDocToUpdate(loroDoc),
              fromCrdtFrontier: EMPTY_LORO_DOC_FRONTIER,
              postId,
            })

            yield* repo.materialize({
              currentCrdtFrontier: frontier,
              locales: sourceData.locales,
              metadata: sourceData.metadata,
              ownerProfileId: input.ownerProfileId,
              postId,
            })
          }),
        )

        const row = yield* repo.findById(postId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PostNotFoundError({ id: postId })),
              onSome: Effect.succeed,
            }),
          ),
        )

        const translation = yield* repo
          .findTranslation({ locale: "pt", postId })
          .pipe(Effect.map(Option.getOrNull))

        return rowToEventData(row, translation?.content ?? emptyContent, "pt")
      })

    const updateNote = (input: UpdateNoteInput) =>
      Effect.gen(function* () {
        const now = yield* nowAsIso

        const existingCrdt = yield* repo.getCrdt(input.postId)
        const sourceDoc = importDoc(existingCrdt.loroCrdt)

        const { doc: updatedDoc, crdt_update } = yield* editPostDoc({
          initialDoc: sourceDoc,
          personId: input.authorId,
          updateData: (current) => ({
            ...current,
            locales: {
              ...current.locales,
              pt: current.locales.pt
                ? { ...current.locales.pt, content: input.content }
                : { content: input.content, originalLocale: "pt", translationSource: "ORIGINAL" },
            },
          }),
        })

        const crdtBlob = loroDocToSnapshot(updatedDoc)
        const newFrontier = updatedDoc.frontiers()

        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* repo.updateCrdt({ id: input.postId, loroCrdt: crdtBlob, updatedAt: now })

            const commit = HumanCommit.makeUnsafe({ personId: input.authorId })
            yield* repo.insertCommit({
              commit,
              crdtUpdate: LoroDocUpdate.makeUnsafe(crdt_update),
              fromCrdtFrontier: sourceDoc.frontiers(),
              postId: input.postId,
            })

            const updatedSourceData = updatedDoc.toJSON() as NoteSourceData
            yield* repo.materialize({
              currentCrdtFrontier: newFrontier,
              locales: updatedSourceData.locales,
              metadata: updatedSourceData.metadata,
              ownerProfileId: existingCrdt.ownerProfileId,
              postId: input.postId,
            })
          }),
        )

        const row = yield* repo.findById(input.postId).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PostNotFoundError({ id: input.postId })),
              onSome: Effect.succeed,
            }),
          ),
        )

        const translation = yield* repo
          .findTranslation({ locale: "pt", postId: input.postId })
          .pipe(Effect.map(Option.getOrNull))

        return rowToNoteData(row, translation?.content ?? emptyContent, "pt")
      })

    const delete_ = (postId: PostId) => sql.withTransaction(repo.delete(postId))

    const findById = (id: PostId, locale: Locale = "pt") =>
      Effect.gen(function* () {
        const row = yield* repo.findById(id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PostNotFoundError({ id })),
              onSome: Effect.succeed,
            }),
          ),
        )

        const translation = yield* repo
          .findTranslation({ locale, postId: id })
          .pipe(Effect.map(Option.getOrNull))

        if (row.kind === "NOTE") {
          return rowToNoteData(row, translation?.content ?? emptyContent, locale)
        }

        return rowToEventData(row, translation?.content ?? emptyContent, locale)
      })

    const findByHandle = (handle: string, locale: Locale = "pt") =>
      Effect.gen(function* () {
        const row = yield* repo.findByHandle(handle).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new PostNotFoundError({ id: handle as any })),
              onSome: Effect.succeed,
            }),
          ),
        )

        const translation = yield* repo
          .findTranslation({ locale, postId: row.id })
          .pipe(Effect.map(Option.getOrNull))

        if (row.kind === "NOTE") {
          return rowToNoteData(row, translation?.content ?? emptyContent, locale)
        }

        return rowToEventData(row, translation?.content ?? emptyContent, locale)
      })

    const getHistory = (postId: PostId) =>
      Effect.gen(function* () {
        const commits = yield* repo.findCommits(postId)

        const history: Array<PostHistoryEntry> = []
        const accumulatedDoc = new LoroDoc()

        for (let i = 0; i < commits.length; i++) {
          const commit = commits[i]
          accumulatedDoc.import(commit.crdtUpdate)
          const parsed = accumulatedDoc.toJSON() as NoteSourceData | EventSourceData

          const author: CrdtCommit = commit.createdById
            ? HumanCommit.makeUnsafe({ personId: commit.createdById })
            : SystemCommit.makeUnsafe({
                workflowName: "unknown",
                workflowVersion: "0",
                model: "unknown",
              })

          history.push({
            author,
            content: parsed.locales?.pt?.content ?? emptyContent,
            createdAt: commit.createdAt,
            version: i + 1,
          })
        }

        return history
      })

    return {
      createEvent,
      createNote,
      delete: delete_,
      findByHandle,
      findById,
      getHistory,
      updateNote,
    } as const
  }),
}) {}
