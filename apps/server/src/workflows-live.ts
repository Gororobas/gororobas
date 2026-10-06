import { Layer } from "effect"

import { PublicationClassificationWorkflowLayer } from "./classification/publication-classification-workflow.js"
import { CommentTranslationWorkflowLayer } from "./translation/comment-translation-workflow.js"
import { PublicationTranslationWorkflowLayer } from "./translation/publication-translation-workflow.js"
import { ExternalDataProvidersLive } from "./wiki/external-data/services/external-data-providers-live.js"
import { FetchArticleExternalDataLive } from "./wiki/external-data/workflow.js"

export const WorkflowsLive = Layer.mergeAll(
  PublicationTranslationWorkflowLayer,
  CommentTranslationWorkflowLayer,
  PublicationClassificationWorkflowLayer,
  FetchArticleExternalDataLive.pipe(Layer.provide(ExternalDataProvidersLive)),
)

// @TODO: how does WorkflowsTest need to be different from WorkflowsLive?
export const WorkflowsTest = WorkflowsLive
