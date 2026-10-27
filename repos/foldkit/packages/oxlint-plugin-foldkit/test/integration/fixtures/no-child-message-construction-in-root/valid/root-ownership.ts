import { Program } from 'foldkit'

import { ApplicationComposition as ImportedApplicationComposition, Message } from './rootApplication'

const RootApplicationComposition = ImportedApplicationComposition

type RootHtmlBuilder = Parameters<
  Parameters<typeof RootApplicationComposition.makeView>[0]
>[1]

const rootViewHelper = (h: RootHtmlBuilder) =>
  h.button([h.OnClick(Message.ClickedContinue())])

const view = RootApplicationComposition.makeView((_model, h) =>
  h.div(
    [h.OnClick(RootApplicationComposition.Message.ClickedElement())],
    [rootViewHelper(h)],
  ),
)

const ApplicationBlock = RootApplicationComposition.prepareBlock({ view })

export const page = Program.make({
  block: ApplicationBlock,
  container,
  routing: {
    onUrlRequest: ApplicationBlock.Message.ClickedLink,
    onUrlChange: ApplicationBlock.Message.ChangedUrl,
  },
})

export const element = Program.makeElement({ block: ApplicationBlock })
