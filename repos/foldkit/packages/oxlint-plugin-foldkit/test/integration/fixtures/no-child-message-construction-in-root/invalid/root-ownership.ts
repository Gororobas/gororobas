import { Program } from 'foldkit'

import { ApplicationComposition as ImportedApplicationComposition } from './rootApplication'

import { Child } from './child'

const RootApplicationComposition = ImportedApplicationComposition

type RootHtmlBuilder = Parameters<
  Parameters<typeof RootApplicationComposition.makeView>[0]
>[1]

const childViewHelper = (h: RootHtmlBuilder) =>
  h.button([h.OnClick(Child.Message.ClickedFromRootViewHelper())])

const view = RootApplicationComposition.makeView((_model, h) =>
  h.div(
    [h.OnClick(RootApplicationComposition.Message.ClickedOwnLink())],
    [childViewHelper(h)],
  ),
)

const elementView = RootApplicationComposition.makeView((_model, h) =>
  h.div([h.OnClick(Child.Message.ClickedFromElementCompletion())]),
)

const ApplicationBlock = RootApplicationComposition.prepareBlock({ view })
const ElementBlock = RootApplicationComposition.prepareBlock({
  view: elementView,
})

export const page = Program.make({
  block: ApplicationBlock,
  container,
  routing: {
    onUrlRequest: ApplicationBlock.Message.ClickedOwnLink,
    onUrlChange: () => Child.Message.ClickedFromRootCompletion(),
  },
})

export const element = Program.makeElement({ block: ElementBlock })
