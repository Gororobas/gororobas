import {
  initializeLoroRichText,
  TiptapDocument,
  WikiArticleEditableData,
  ProfileId,
} from "@gororobas/domain"
import { Effect, Predicate, Record, Schema } from "effect"
import { diff } from "json-diff-ts"
import { LoroDoc, LoroMap } from "loro-crdt"

export const WikiMigrationVersion = Schema.Struct({
  article: WikiArticleEditableData,
  sourceEditId: Schema.NullOr(Schema.String),
  actorId: Schema.NullOr(ProfileId),
  reviewerId: Schema.NullOr(ProfileId),
  timestamp: Schema.String,
  frontier: Schema.Unknown,
  loroDiff: Schema.Unknown,
  changes: Schema.Unknown,
  loroSnapshot: Schema.String,
})
export type WikiMigrationVersion = typeof WikiMigrationVersion.Type

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))
const synchronizeMap = (map: LoroMap, target: Schema.JsonObject) => {
  Schema.decodeUnknownSync(Schema.Array(Schema.String))(map.keys()).forEach((key) => {
    if (!(key in target)) map.delete(key)
  })
  const current = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(map.toJSON())
  Record.toEntries(target).forEach(([key, value]) => {
    if (current[key] !== undefined && json(current[key]) === json(value)) return
    if (Array.isArray(value)) {
      const list = map.ensureMergeableMovableList(key)
      if (list.length) list.delete(0, list.length)
      value.forEach((item, index) => list.insert(index, item))
    } else if (Predicate.isObject(value) && !("type" in value) && !("_tag" in value)) {
      synchronizeMap(
        map.ensureMergeableMap(key),
        Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Json))(value),
      )
    } else if (value === null) map.delete(key)
    else map.set(key, value)
  })
}

/** A migration-generated Loro timeline from Gel states, not original Gel CRDT history. */
export const buildWikiMigrationHistory = Effect.fn("buildWikiMigrationHistory")(function* (
  versions: ReadonlyArray<
    Pick<WikiMigrationVersion, "article" | "sourceEditId" | "actorId" | "reviewerId" | "timestamp">
  >,
) {
  const document = new LoroDoc()
  document.configDefaultTextStyle({ expand: "after" })
  const results: Array<WikiMigrationVersion> = []
  let previous: unknown = {}
  yield* Effect.forEach(
    versions,
    (version) =>
      Effect.gen(function* () {
        const encoded = yield* Schema.encodeEffect(WikiArticleEditableData)(version.article)
        const attributes = yield* Schema.decodeUnknownEffect(
          Schema.Record(Schema.String, Schema.Json),
        )(encoded.attributes)
        const translations = yield* Schema.decodeUnknownEffect(
          Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Json)),
        )(encoded.translations)
        const values = {
          kind: { value: version.article.kind },
          attributes,
          translations: Record.map(translations, (translation) =>
            Record.filter(translation, (_, key) => key !== "content"),
          ),
        }
        const from = document.frontiers()
        if (version.actorId)
          document.setPeerId(BigInt(`0x${version.actorId.replaceAll("-", "").slice(-16)}`))
        document
          .getMap("translations")
          .entries()
          .forEach(([, translation]) => {
            if (translation instanceof LoroMap) translation.delete("content")
          })
        yield* Effect.forEach(
          Record.toEntries(values),
          ([key, value]) =>
            Effect.gen(function* () {
              synchronizeMap(
                document.getMap(key),
                yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Json))(value),
              )
            }),
          { concurrency: 1 },
        )
        // Synthetic migration history replaces rich-text subtrees; live editor
        // updates must retain their container identities through loro-prosemirror.
        Record.toEntries(translations).forEach(([locale, translation]) => {
          if (translation.content !== null && translation.content !== undefined)
            initializeLoroRichText(
              document
                .getMap("translations")
                .ensureMergeableMap(locale)
                .ensureMergeableMap("content"),
              Schema.decodeUnknownSync(TiptapDocument)(translation.content),
            )
        })
        document.commit({
          message: version.actorId
            ? json({ _tag: "HumanCommit", personId: version.actorId })
            : json({
                _tag: "SystemCommit",
                workflowName: "gel-migration",
                workflowVersion: "1",
                model: "none",
              }),
        })
        const frontier = document.frontiers()
        results.push(
          WikiMigrationVersion.make({
            ...version,
            frontier,
            loroDiff: document.diff(from, frontier, true),
            changes: diff(previous, encoded),
            loroSnapshot: Buffer.from(document.export({ mode: "snapshot" })).toString("base64"),
          }),
        )
        previous = encoded
      }),
    { concurrency: 1 },
  )
  return results
})
