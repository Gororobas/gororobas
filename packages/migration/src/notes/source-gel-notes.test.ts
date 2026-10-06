import { NodeServices } from "@effect/platform-node"
import { it } from "@effect/vitest"
import { IdGen, PublicationVisibility } from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Effect, FileSystem, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { createClient } from "gel"
import { expect, vi } from "vitest"

import { GelClient, GelClientError } from "../gel-client.js"
import { GelNoteWithRelations } from "../schemas/gel/entities.js"
import { MigrationContext } from "../services/migration-context.js"
import { gelNoteToPublication } from "./gel-note-to-publication.js"
import { sourceGelNotes } from "./source-gel-notes.js"

const mappedId = "019a0dce-1fc0-7abc-8abc-123456789abc"

const context = MigrationContext.of({
  resolveId: () => Effect.succeed(mappedId),
  registerMapping: () => Effect.void,
  planMigrationOp: () => Effect.succeed({ op: "skip", reason: "unchanged" }),
})

const timestamp = Schema.decodeSync(Schema.DateFromString)("2025-08-06T05:00:00Z")

const note = Schema.decodeSync(GelNoteWithRelations)({
  id: "note-id",
  handle: "eucalyptus-discovery",
  created_at: timestamp,
  updated_at: timestamp,
  published_at: timestamp,
  public: true,
  publish_status: "PUBLIC",
  types: ["DESCOBERTA"],
  title: {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "mention",
            attrs: { data: '{"label":"Eucalipto","id":"plant-id","objectType":"Vegetable"}' },
          },
        ],
      },
    ],
  },
  body: null,
  content_plain_text: "@Eucalipto",
  created_by: { id: "person-id", handle: "henrique", name: "henrique" },
  related_to_vegetables: [{ id: "plant-id", handle: "eucalipto", names: ["Eucalipto"] }],
  related_to_notes: [],
})

const makeTestGelClient = (records: Array<unknown>) => {
  const client = createClient({ dsn: "gel://localhost/test" })
  vi.spyOn(client, "query").mockResolvedValue(records)

  return GelClient.of({
    use: (operation) =>
      Effect.tryPromise({
        try: () => operation(client),
        catch: (error) => new GelClientError({ message: "Test query failed", error }),
      }),
  })
}

it.effect("converts notes and preserves Gel Date values, mentions and relations", () => {
  const writes: Array<{ path: string; content: string }> = []

  return sourceGelNotes.pipe(
    Effect.provideService(GelClient, makeTestGelClient([note])),
    Effect.provideService(
      FileSystem.FileSystem,
      FileSystem.makeNoop({
        makeDirectory: () => Effect.void,
        writeFileString: (path, content) =>
          Effect.sync(() => {
            writes.push({ path, content })
          }),
      }),
    ),
    Effect.provideService(MigrationContext, context),
    Effect.provideService(IdGen, { generate: () => mappedId }),
    Effect.provide(NodeServices.layer),
    Effect.tap(() =>
      Effect.sync(() => {
        expect(writes.length).toBe(3)
        expect(writes[0].path).toMatch(/debug\/raw-gel\/notes\.json$/)
        const { path, content } = writes[2]
        expect(path).toMatch(/debug\/notes\/eucalyptus-discovery\.json$/)

        expect(Schema.decodeSync(Schema.fromJsonString(Schema.Unknown))(content)).toMatchObject({
          id: mappedId,
          tagIds: [mappedId],
          wikiArticleIds: [mappedId],
          publication: {
            metadata: {
              kind: "POST",
              handle: note.handle,
              visibility: "PUBLIC",
              ownerProfileId: mappedId,
              publishedAt: timestamp.toISOString(),
            },
            locales: { pt: { originalLocale: "pt", translationSource: "ORIGINAL" } },
          },
          conversion_error: null,
          latest_source: {
            ...note,
            created_at: timestamp.toISOString(),
            updated_at: timestamp.toISOString(),
            published_at: timestamp.toISOString(),
          },
        })
      }),
    ),
  )
})

it.effect("archives invalid raw notes before rejecting conversion", () => {
  const writeFileString = vi.fn<FileSystem.FileSystem["writeFileString"]>(() => Effect.void)

  return sourceGelNotes.pipe(
    Effect.provideService(
      GelClient,
      makeTestGelClient([{ ...note, published_at: "not a Gel Date" }]),
    ),
    Effect.provideService(
      FileSystem.FileSystem,
      FileSystem.makeNoop({ makeDirectory: () => Effect.void, writeFileString }),
    ),
    Effect.provideService(MigrationContext, context),
    Effect.provideService(IdGen, { generate: () => mappedId }),
    Effect.provide(NodeServices.layer),
    Effect.flip,
    Effect.tap((error) =>
      Effect.sync(() => {
        expect(error._tag).toBe("SchemaError")
        expect(writeFileString).toHaveBeenCalledTimes(1)
        expect(writeFileString.mock.calls[0][0]).toMatch(/debug\/raw-gel\/notes\.json$/)
        expect(JSON.parse(writeFileString.mock.calls[0][1])).toMatchObject([
          { published_at: "not a Gel Date" },
        ])
      }),
    ),
  )
})

it.effect("archives private notes separately and removes earlier publication exports", () => {
  const writes: Array<{ path: string; content: string }> = []
  const remove = vi.fn<FileSystem.FileSystem["remove"]>(() => Effect.void)

  return sourceGelNotes.pipe(
    Effect.provideService(
      GelClient,
      makeTestGelClient([{ ...note, publish_status: "PRIVATE", public: false }]),
    ),
    Effect.provideService(
      FileSystem.FileSystem,
      FileSystem.makeNoop({
        makeDirectory: () => Effect.void,
        remove,
        writeFileString: (path, content) =>
          Effect.sync(() => {
            writes.push({ path, content })
          }),
      }),
    ),
    Effect.provideService(MigrationContext, context),
    Effect.provideService(IdGen, { generate: () => mappedId }),
    Effect.provide(NodeServices.layer),
    Effect.tap(() =>
      Effect.sync(() => {
        expect(writes).toHaveLength(2)
        expect(
          Schema.decodeSync(Schema.fromJsonString(Schema.Unknown))(writes[1].content),
        ).toMatchObject([{ publish_status: "PRIVATE", created_by: note.created_by }])
        expect(writes[1].path).toMatch(/debug\/journal\/notes\.json$/)
        expect(remove).toHaveBeenCalledWith(
          expect.stringMatching(/debug\/notes\/eucalyptus-discovery\.json$/),
          { force: true },
        )
      }),
    ),
  )
})

it.effect("preserves ordered title and body nodes for every supported visibility", () =>
  assertPropertyEffect({
    arbitrary: Arbitrary.all([
      Arbitrary.schema(Schema.String),
      Arbitrary.schema(Schema.NullOr(Schema.String)),
      Arbitrary.schema(PublicationVisibility),
    ]),
    predicate: ([title, body, visibility]) => {
      const original = GelNoteWithRelations.make({
        ...note,
        publish_status: visibility,
        title: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: title }] }],
        },
        body:
          body === null
            ? null
            : {
                type: "doc",
                version: 1,
                content: [{ type: "paragraph", content: [{ type: "text", text: body }] }],
              },
      })

      return gelNoteToPublication(original).pipe(
        Effect.map((publication) => {
          expect(publication.visibility).toBe(visibility)
          expect(publication.content.content).toEqual([
            ...original.title.content,
            ...(original.body?.content ?? []),
          ])
          return true
        }),
      )
    },
  }),
)
