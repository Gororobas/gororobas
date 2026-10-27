import { Array as EffectArray, Option, Record } from "effect"

import type { WikiArticleId } from "../common/ids.js"
import type { TiptapDocument, TiptapNode } from "../rich-text/domain.js"
import { nodeIdOf } from "../rich-text/node-ids.js"
import type { EntityReferenceEvidence, EvidenceLocation } from "./domain.js"

interface LocatedContent {
  /** Where the document sits in the linking entity's data. */
  readonly path: EvidenceLocation
  readonly content: TiptapDocument
}

export interface EntityReferenceLink {
  readonly wikiArticleId: WikiArticleId
  readonly evidence: EffectArray.NonEmptyReadonlyArray<EntityReferenceEvidence>
}

/**
 * Wiki articles referenced by `entityReference` nodes, with every reference as evidence.
 * Stored content always has node IDs (see `assignTiptapNodeIds`), so every reference has a location.
 */
export const entityReferenceLinks = (
  contents: ReadonlyArray<LocatedContent>,
): ReadonlyArray<EntityReferenceLink> => {
  const evidence = contents.flatMap(({ path, content }) => {
    const found: Array<readonly [WikiArticleId, EntityReferenceEvidence]> = []

    const visit = (node: TiptapNode): void => {
      if (node.type === "entityReference") {
        const attributes = node.attrs
        const nodeId = nodeIdOf(node)

        if (attributes.referenceType === "WIKI_ARTICLE" && Option.isSome(nodeId)) {
          found.push([
            attributes.referenceId,
            {
              location: [...path, { id: nodeId.value }],
              text: attributes.labelAtInsertion,
            },
          ])
        }
      }

      if ("content" in node) node.content?.forEach(visit)
    }

    content.content.forEach(visit)
    return found
  })

  return Record.values(EffectArray.groupBy(evidence, ([wikiArticleId]) => wikiArticleId)).map(
    (group) => ({
      wikiArticleId: group[0][0],
      evidence: EffectArray.map(group, ([, item]) => item),
    }),
  )
}
