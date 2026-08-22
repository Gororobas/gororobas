import {
  applyCrdtUpdateWithCommit,
  createLoroDocFromData,
  LoroDocFrontier,
  loroDocToSnapshot,
  loroDocToUpdate,
  parseCrdtUpdate,
  snapshotToLoroDoc,
  TiptapDocument,
  WikiArticleEditableData,
  WikiArticleTranslation,
  WikiArticleTranslations,
  type LoroDocSnapshot,
  type LoroDocUpdate,
  type CrdtCommit,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Option, Record, Schema, Struct, Tuple } from "effect"
import { schema as loroSchema } from "loro-mirror"

const NameInCrdtListLoro = loroSchema.LoroMap({
  value: loroSchema.String({ required: true }),
})

const StringListLoro = loroSchema.LoroList(loroSchema.String(), undefined, { required: false })

const WikiArticleTranslationLoro = loroSchema.LoroMap(
  {
    commonNames: loroSchema.LoroList(NameInCrdtListLoro, (name) => name.$cid),
    content: loroSchema.String({ required: false }),
    grammaticalGender: loroSchema.String({ required: false }),
  },
  { required: false },
)

const WikiArticleAttributesLoro = loroSchema.LoroMap({
  developmentCycleMax: loroSchema.Number({ required: false }),
  developmentCycleMin: loroSchema.Number({ required: false }),
  edibleParts: StringListLoro,
  heightMax: loroSchema.Number({ required: false }),
  heightMin: loroSchema.Number({ required: false }),
  lifecycles: StringListLoro,
  plantingMethods: StringListLoro,
  roles: StringListLoro,
  scientificNames: loroSchema.LoroList(NameInCrdtListLoro, (name) => name.$cid, {
    required: false,
  }),
  strata: StringListLoro,
  suggestedKind: loroSchema.String({ required: false }),
  tags: StringListLoro,
  temperatureMax: loroSchema.Number({ required: false }),
  temperatureMin: loroSchema.Number({ required: false }),
  usage: StringListLoro,
})

/** CRDT storage has a container root because Loro root values must be containers. */
export const WikiArticleEditableDataLoro = loroSchema({
  article: loroSchema.LoroMap({
    _tag: loroSchema.String({ required: true }),
    attributes: WikiArticleAttributesLoro,
    translations: loroSchema.LoroMap({
      en: WikiArticleTranslationLoro,
      es: WikiArticleTranslationLoro,
      pt: WikiArticleTranslationLoro,
    }),
  }),
})

const WikiArticleTranslationStorage = WikiArticleTranslation.mapFields(
  Struct.assign({
    content: Schema.OptionFromOptionalNullOr(Schema.fromJsonString(TiptapDocument), {
      onNoneEncoding: undefined,
    }),
  }),
)

const WikiArticleTranslationsStorage = WikiArticleTranslations.mapFields(
  Struct.evolve({
    en: () => Schema.optional(Schema.NullOr(WikiArticleTranslationStorage)),
    es: () => Schema.optional(Schema.NullOr(WikiArticleTranslationStorage)),
    pt: () => Schema.optional(Schema.NullOr(WikiArticleTranslationStorage)),
  }),
)

const WikiArticleEditableDataStorage = WikiArticleEditableData.mapMembers(
  Tuple.evolve([
    (member) => member.mapFields(Struct.assign({ translations: WikiArticleTranslationsStorage })),
    (member) => member.mapFields(Struct.assign({ translations: WikiArticleTranslationsStorage })),
    (member) => member.mapFields(Struct.assign({ translations: WikiArticleTranslationsStorage })),
    (member) => member.mapFields(Struct.assign({ translations: WikiArticleTranslationsStorage })),
    (member) => member.mapFields(Struct.assign({ translations: WikiArticleTranslationsStorage })),
  ]),
)

export const WikiArticleCrdtStorageData = Schema.Struct({
  article: WikiArticleEditableDataStorage,
})

const wikiArticleStorageToSourceData = (
  storageData: typeof WikiArticleEditableDataStorage.Type,
) => {
  const encoded = Schema.encodeSync(WikiArticleEditableDataStorage)(storageData)
  return Schema.decodeUnknownEffect(WikiArticleEditableData)({
    ...encoded,
    translations: {
      en: encoded.translations.en ?? undefined,
      es: encoded.translations.es ?? undefined,
      pt: encoded.translations.pt ?? undefined,
    },
  })
}

const encodeTranslation = (translation: WikiArticleTranslation) => ({
  commonNames: translation.commonNames,
  content: Option.match(translation.content, {
    onNone: () => undefined,
    onSome: (content) => Schema.encodeSync(Schema.fromJsonString(TiptapDocument))(content),
  }),
  grammaticalGender: Option.getOrUndefined(translation.grammaticalGender),
})

const encodeAttributes = (attributes: object) =>
  Record.fromEntries(
    Record.toEntries(attributes).flatMap(([key, value]) => {
      if (!Option.isOption(value)) return [[key, value]]
      return EffectArray.map(Option.toArray(value), (some) => [key, some] as const)
    }),
  )

export const wikiArticleDataToCrdtStorage = (sourceData: WikiArticleEditableData) => ({
  article: {
    _tag: sourceData._tag,
    attributes: encodeAttributes(sourceData.attributes),
    translations: {
      en: sourceData.translations.en ? encodeTranslation(sourceData.translations.en) : undefined,
      es: sourceData.translations.es ? encodeTranslation(sourceData.translations.es) : undefined,
      pt: sourceData.translations.pt ? encodeTranslation(sourceData.translations.pt) : undefined,
    },
  },
})

export const createWikiArticleSnapshot = (sourceData: WikiArticleEditableData) => {
  const sourceDoc = createLoroDocFromData(
    wikiArticleDataToCrdtStorage(sourceData),
    WikiArticleEditableDataLoro,
  )

  return {
    currentCrdtFrontier: LoroDocFrontier.make(sourceDoc.frontiers()),
    crdtSnapshot: loroDocToSnapshot(sourceDoc),
    initialCrdtUpdate: loroDocToUpdate(sourceDoc),
    sourceData,
  } as const
}

export const parseWikiArticleCrdtUpdate = (input: {
  crdtUpdate: LoroDocUpdate
  snapshot: LoroDocSnapshot
}) =>
  parseCrdtUpdate({
    crdtUpdate: input.crdtUpdate,
    sourceDocument: snapshotToLoroDoc(input.snapshot),
    targetSchema: WikiArticleCrdtStorageData,
  }).pipe(
    Effect.flatMap(({ data, ...result }) =>
      wikiArticleStorageToSourceData(data.article).pipe(
        Effect.map((sourceData) => ({ ...result, data: sourceData })),
      ),
    ),
  )

export const applyWikiArticleCrdtUpdateWithCommit = (input: {
  commit: CrdtCommit
  crdtUpdate: LoroDocUpdate
  snapshot: LoroDocSnapshot
}) =>
  applyCrdtUpdateWithCommit({
    commit: input.commit,
    crdtUpdate: input.crdtUpdate,
    snapshot: input.snapshot,
    targetSchema: WikiArticleCrdtStorageData,
  }).pipe(
    Effect.flatMap(({ data, ...result }) =>
      wikiArticleStorageToSourceData(data.article).pipe(
        Effect.map((sourceData) => ({ ...result, data: sourceData })),
      ),
    ),
  )
