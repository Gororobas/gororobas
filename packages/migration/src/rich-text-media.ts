import { MediaAssetId, TiptapNode } from "@gororobas/domain"
import { Array as EffectArray } from "effect"

export const richTextMediaIds = (nodes: ReadonlyArray<TiptapNode>): Array<MediaAssetId> =>
  EffectArray.dedupe(
    nodes.flatMap((node) =>
      node.type === "mediaGrid"
        ? node.attrs.items.flatMap((item) =>
            item.source === "MEDIA_ASSET" ? [item.mediaAssetId] : [],
          )
        : "content" in node
          ? richTextMediaIds(node.content ?? [])
          : [],
    ),
  )
