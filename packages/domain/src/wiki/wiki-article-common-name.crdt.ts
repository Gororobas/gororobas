import { Effect, Option, Schema } from "effect"
import { type LoroDoc, LoroMap, LoroMovableList } from "loro-crdt"

import { GrammaticalGender, SupportedLanguage } from "../common/enums.js"
import { LoroListItemId } from "../common/ids.js"
import { ValidName } from "../common/primitives.js"
import {
  CrdtContainerNotFoundError,
  CrdtListItemNotFoundError,
  InvalidCrdtUpdateError,
} from "../crdts/errors.js"
import { createCrdtListItemId } from "../crdts/lib.js"
import {
  WikiArticleCommonName,
  WikiArticleCommonNameInCrdtList,
} from "./wiki-article-common-name.js"

export const initializeWikiArticleCommonNames = (
  list: LoroMovableList,
  names: ReadonlyArray<WikiArticleCommonNameInCrdtList>,
) => {
  if (list.length) list.delete(0, list.length)

  names.forEach((name) => {
    const map = list.pushContainer(new LoroMap())
    map.set("id", name.id)
    map.set("name", name.name)
    if (Option.isSome(name.grammaticalGender)) {
      map.set("grammaticalGender", name.grammaticalGender.value)
    }
  })
}

const getNames = (document: LoroDoc, language: SupportedLanguage) =>
  Effect.gen(function* () {
    const translation = document.getMap("translations").get(language)
    if (!(translation instanceof LoroMap)) {
      return yield* new CrdtContainerNotFoundError({ path: ["translations", language] })
    }
    const list = translation.get("commonNames")

    if (!(list instanceof LoroMovableList)) {
      return yield* new CrdtContainerNotFoundError({
        path: ["translations", language, "commonNames"],
      })
    }

    return list
  })

const findName = (list: LoroMovableList, id: LoroListItemId) =>
  Effect.gen(function* () {
    const index = list
      .toArray()
      .findIndex((item) => item instanceof LoroMap && item.get("id") === id)
    const map = index < 0 ? undefined : list.get(index)
    if (!(map instanceof LoroMap)) {
      return yield* new CrdtListItemNotFoundError({ id, list: list.id })
    }
    return { index, map }
  })

const targetFields = { language: SupportedLanguage, id: LoroListItemId }

const AddedName = Schema.TaggedStruct("AddedWikiArticleTranslationCommonName", {
  language: SupportedLanguage,
  value: WikiArticleCommonName,
})

const RemovedName = Schema.TaggedStruct("RemovedWikiArticleTranslationCommonName", targetFields)

const UpdatedName = Schema.TaggedStruct("UpdatedWikiArticleTranslationCommonName", {
  ...targetFields,
  name: ValidName,
})

const MovedName = Schema.TaggedStruct("MovedWikiArticleTranslationCommonName", {
  ...targetFields,
  newIndex: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})

const SetNameGrammaticalGender = Schema.TaggedStruct(
  "SetWikiArticleTranslationCommonNameGrammaticalGender",
  {
    ...targetFields,
    value: GrammaticalGender,
  },
)

const UnsetNameGrammaticalGender = Schema.TaggedStruct(
  "UnsetWikiArticleTranslationCommonNameGrammaticalGender",
  targetFields,
)

export const WikiArticleCommonNameCrdtOperations = [
  {
    message: AddedName,
    handler: Effect.fn(function* (document: LoroDoc, payload: typeof AddedName.Type) {
      const list = yield* getNames(document, payload.language)
      const map = list.pushContainer(new LoroMap())
      map.set("id", createCrdtListItemId())
      map.set("name", payload.value.name)
      if (Option.isSome(payload.value.grammaticalGender)) {
        map.set("grammaticalGender", payload.value.grammaticalGender.value)
      }
    }),
  },
  {
    message: RemovedName,
    handler: Effect.fn(function* (document: LoroDoc, payload: typeof RemovedName.Type) {
      const list = yield* getNames(document, payload.language)
      const { index } = yield* findName(list, payload.id)
      if (list.length <= 1) return yield* new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
      list.delete(index, 1)
    }),
  },
  {
    message: UpdatedName,
    handler: Effect.fn(function* (document: LoroDoc, payload: typeof UpdatedName.Type) {
      const list = yield* getNames(document, payload.language)
      const { map } = yield* findName(list, payload.id)
      map.set("name", payload.name)
    }),
  },
  {
    message: MovedName,
    handler: Effect.fn(function* (document: LoroDoc, payload: typeof MovedName.Type) {
      const list = yield* getNames(document, payload.language)
      const { index } = yield* findName(list, payload.id)
      if (payload.newIndex < 0 || payload.newIndex >= list.length) {
        return yield* new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
      }
      list.move(index, payload.newIndex)
    }),
  },
  {
    message: SetNameGrammaticalGender,
    handler: Effect.fn(function* (
      document: LoroDoc,
      payload: typeof SetNameGrammaticalGender.Type,
    ) {
      const list = yield* getNames(document, payload.language)
      const { map } = yield* findName(list, payload.id)
      map.set("grammaticalGender", payload.value)
    }),
  },
  {
    message: UnsetNameGrammaticalGender,
    handler: Effect.fn(function* (
      document: LoroDoc,
      payload: typeof UnsetNameGrammaticalGender.Type,
    ) {
      const list = yield* getNames(document, payload.language)
      const { map } = yield* findName(list, payload.id)
      map.delete("grammaticalGender")
    }),
  },
] as const
