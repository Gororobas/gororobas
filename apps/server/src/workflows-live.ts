import { Layer } from "effect"

import { PublicationClassificationWorkflowLayer } from "./classification/publication-classification-workflow.js"
import { MediaDeletionWorkflowLayer } from "./media-assets/media-deletion-workflow.js"
import { MediaAssetsStorage } from "./media-assets/storage.js"
import { PublicationCommentTranslationWorkflowLayer } from "./translation/publication-comment-translation-workflow.js"
import { PublicationTranslationWorkflowLayer } from "./translation/publication-translation-workflow.js"
import { ExternalDataRefreshLive } from "./wiki/external-data/refresh.js"
import { ExternalDataProvidersLive } from "./wiki/external-data/services/external-data-providers-live.js"
import { FetchArticleExternalDataLive } from "./wiki/external-data/workflow.js"

export const WorkflowsLive = Layer.mergeAll(
  MediaDeletionWorkflowLayer.pipe(
    Layer.provide(Layer.effect(MediaAssetsStorage, MediaAssetsStorage.make)),
  ),
  PublicationTranslationWorkflowLayer,
  PublicationCommentTranslationWorkflowLayer,
  PublicationClassificationWorkflowLayer,
  FetchArticleExternalDataLive.pipe(Layer.provide(ExternalDataProvidersLive)),
  ExternalDataRefreshLive,
)
