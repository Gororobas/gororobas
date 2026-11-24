import { Command } from "cmdk"

import type { GraphNode } from "./graph.js"
import { kinds } from "./node-card.js"

/** Every search word must appear somewhere; matches in earlier keywords (the title) rank higher. */
function rank(search: string, keywords: ReadonlyArray<string> = []) {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const fields = keywords.map((keyword) => keyword.toLowerCase())
  const scores = words.map((word) => {
    const index = fields.findIndex((field) => field.includes(word))
    return index === -1 ? 0 : 1 / (index + 1)
  })

  return scores.includes(0) ? 0 : scores.reduce((sum, score) => sum + score, 0) / scores.length
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
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Search nodes"
      className="command-palette"
      overlayClassName="command-overlay"
      // cmdk calls filters with (value, search, keywords).
      filter={(...[, search, keywords]) => rank(search, keywords)}
    >
      <Command.Input placeholder="Search nodes…" />
      <Command.List>
        <Command.Empty>No matching nodes.</Command.Empty>
        {nodes.map((node) => (
          <Command.Item
            key={node.id}
            value={node.id}
            keywords={[
              node.title,
              kinds[node.kind].title,
              ...(node.kind === "event" ? [node.eventType] : []),
              node.description,
              node.openQuestions ?? "",
            ]}
            className={node.kind}
            onSelect={() => onPick(node.id)}
          >
            <span className="node-glyph">{kinds[node.kind].glyph}</span>
            <span className="command-item-text">
              <strong>{node.title.trim() || "Untitled"}</strong>
              <span>{node.description.trim().replace(/\s+/g, " ")}</span>
            </span>
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  )
}
