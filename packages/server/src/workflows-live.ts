import { Layer } from "effect"

import { PostClassificationWorkflowLayer } from "./classification/post-classification-workflow.js"
import { CommentTranslationWorkflowLayer } from "./translation/comment-translation-workflow.js"
import { PostTranslationWorkflowLayer } from "./translation/post-translation-workflow.js"

export const WorkflowsLive = Layer.mergeAll(
  PostTranslationWorkflowLayer,
  CommentTranslationWorkflowLayer,
  PostClassificationWorkflowLayer,
)

// @TODO: how does WorkflowsTest need to be different from WorkflowsLive?
export const WorkflowsTest = WorkflowsLive
