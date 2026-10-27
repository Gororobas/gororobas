import { type Html } from 'foldkit/html'

import { type CodeBlock } from './component'
import type { SnippetDisclosureBinding } from './composition'
import { SnippetDisclosureBlock } from './snippetDisclosure'

type Render = (
  config: Parameters<typeof SnippetDisclosureBinding.embedView>[0],
) => Html

export const renderer =
  (
    model: typeof SnippetDisclosureBlock.Model.Type,
    renderCopyButton: CodeBlock.RenderCopyButton,
    render: Render,
  ): CodeBlock.RenderSnippet =>
  config =>
    render({
      slotId: `snippet-disclosure-${config.id}`,
      model,
      viewInputs: { ...config, renderCopyButton },
    })
