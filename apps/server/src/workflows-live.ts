import { Layer } from "effect"

import { PublicationClassificationWorkflowLayer } from "./classification/publication-classification-workflow.js"
import { PublicationCommentTranslationWorkflowLayer } from "./translation/publication-comment-translation-workflow.js"
import { PublicationTranslationWorkflowLayer } from "./translation/publication-translation-workflow.js"
import { ExternalDataProvidersLive } from "./wiki/external-data/services/external-data-providers-live.js"
import { FetchArticleExternalDataLive } from "./wiki/external-data/workflow.js"

export const WorkflowsLive = Layer.mergeAll(
  PublicationTranslationWorkflowLayer,
  PublicationCommentTranslationWorkflowLayer,
  PublicationClassificationWorkflowLayer,
  FetchArticleExternalDataLive.pipe(Layer.provide(ExternalDataProvidersLive)),
)

// @TODO: how does WorkflowsTest need to be different from WorkflowsLive?
export const WorkflowsTest = WorkflowsLive
