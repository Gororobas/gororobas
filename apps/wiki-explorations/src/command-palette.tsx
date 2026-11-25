import { Autocomplete } from "@base-ui/react/autocomplete"
import { Dialog } from "@base-ui/react/dialog"
import { Array as EffectArray, Order } from "effect"
import { useState } from "react"

import type { GraphNode } from "./graph.js"
import { kinds } from "./node-card.js"

/** Every search word must appear somewhere; matches in earlier keywords (the title) rank higher. */
function rank(search: string, keywords: ReadonlyArray<string>) {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const fields = keywords.map((keyword) => keyword.toLowerCase())
  const scores = words.map((word) => {
    const index = fields.findIndex((field) => field.includes(word))
    return index === -1 ? 0 : 1 / (index + 1)
  })

  return scores.includes(0) ? 0 : scores.reduce((sum, score) => sum + score, 0) / scores.length
}

const keywords = (node: GraphNode) => [
  node.title,
  kinds[node.kind].title,
  ...(node.kind === "event" ? [node.eventType] : []),
  node.description,
  node.openQuestions ?? "",
]

const byScoreDescending = Order.flip(
  Order.mapInput(Order.Number, ({ score }: { score: number }) => score),
)

function search(nodes: ReadonlyArray<GraphNode>, query: string) {
  if (!query.trim()) return nodes

  const matches = nodes
    .map((node) => ({ node, score: rank(query, keywords(node)) }))
    .filter(({ score }) => score > 0)
  return EffectArray.sort(matches, byScoreDescending).map(({ node }) => node)
}

/** Searches node titles, kinds and descriptions; Enter picks the highlighted node. */
export function CommandPalette({
  open,
  onOpenChange,
  nodes,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodes: ReadonlyArray<GraphNode>
  onPick: (id: string) => void
}) {
  const [query, setQuery] = useState("")

  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(open) => open || setQuery("")}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop" />
        <Dialog.Popup className="command-palette nokey" aria-label="Search nodes">
          <Autocomplete.Root
            open
            inline
            items={nodes}
            filteredItems={search(nodes, query)}
            value={query}
            onValueChange={setQuery}
            itemToStringValue={(node) => node.title}
            autoHighlight="always"
            keepHighlight
          >
            <Autocomplete.Input className="command-input" placeholder="Search nodes…" />
            <Autocomplete.Empty className="command-empty">No matching nodes.</Autocomplete.Empty>
            <Autocomplete.List className="command-list">
              {(node: GraphNode) => (
                <Autocomplete.Item
                  key={node.id}
                  value={node}
                  className={`command-item ${node.kind}`}
                  onClick={() => onPick(node.id)}
                >
                  <span className="node-glyph">{kinds[node.kind].glyph}</span>
                  <span className="command-item-text">
                    <strong>{node.title.trim() || "Untitled"}</strong>
                    <span>{node.description.trim().replace(/\s+/g, " ")}</span>
                  </span>
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Root>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
