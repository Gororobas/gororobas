import { Effect, Schema } from "effect"
import { LoroDoc } from "loro-crdt"

import { CrdtCommit, LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import {
  applyCrdtUpdateWithCommit,
  loroDocToSnapshot,
  loroDocToUpdate,
  parseCrdtUpdate,
  snapshotToLoroDoc,
} from "../crdts/lib.js"
import { WikiAnimalArticleCrdtOperations } from "./kinds/animal.crdt.js"
import { WikiConceptArticleCrdtOperations } from "./kinds/concept.crdt.js"
import { WikiPlantArticleCrdtOperations } from "./kinds/plant.crdt.js"
import { WikiToolArticleCrdtOperations } from "./kinds/tool.crdt.js"
import { WikiUncategorizedArticleCrdtOperations } from "./kinds/uncategorized.crdt.js"
import { WikiArticleEditableData } from "./wiki-article.js"

export const WikiArticleEdit = Schema.Union([
  WikiAnimalArticleCrdtOperations.AttributeEdit,
  WikiConceptArticleCrdtOperations.AttributeEdit,
  WikiPlantArticleCrdtOperations.AttributeEdit,
  WikiToolArticleCrdtOperations.AttributeEdit,
  WikiUncategorizedArticleCrdtOperations.AttributeEdit,
  // @todo wiki-article-translation
])
export type WikiArticleEdit = typeof WikiArticleEdit.Type

/** @todo rewrite with Match */
export const applyWikiArticleEdit = (document: LoroDoc, edit: WikiArticleEdit) => {
  if (Schema.is(WikiAnimalArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiAnimalArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  if (Schema.is(WikiConceptArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiConceptArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  if (Schema.is(WikiPlantArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiPlantArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  if (Schema.is(WikiToolArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiToolArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  if (Schema.is(WikiUncategorizedArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiUncategorizedArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  // @todo wiki-article-translation
  return Effect.succeed(undefined)
}

export const createWikiArticleCrdtDocument = Effect.fn("createWikiArticleCrdtDocument")(function* (
  sourceData: WikiArticleEditableData,
) {
  const sourceDocument = new LoroDoc()
  const encoded = yield* Schema.encodeEffect(WikiArticleEditableData)(sourceData)

  // @todo find a way to initialize the document from JSON
  yield* Effect.logInfo(encoded)

  return {
    currentCrdtFrontier: LoroDocFrontier.make(sourceDocument.frontiers()),
    crdtSnapshot: loroDocToSnapshot(sourceDocument),
    initialCrdtUpdate: loroDocToUpdate(sourceDocument),
    sourceData,
  } as const
})

export const parseWikiArticleCrdtUpdate = (input: {
  crdtUpdate: LoroDocUpdate
  snapshot: LoroDocSnapshot
}) =>
  parseCrdtUpdate({
    crdtUpdate: input.crdtUpdate,
    sourceDocument: snapshotToLoroDoc(input.snapshot),
    targetSchema: WikiArticleEditableData,
  })

export const applyWikiArticleCrdtUpdateWithCommit = (input: {
  commit: CrdtCommit
  crdtUpdate: LoroDocUpdate
  snapshot: LoroDocSnapshot
}) =>
  applyCrdtUpdateWithCommit({
    commit: input.commit,
    crdtUpdate: input.crdtUpdate,
    snapshot: input.snapshot,
    targetSchema: WikiArticleEditableData,
  })
