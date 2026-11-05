import {
  type ExternalDataFetchRequest,
  type ExternalDataInputs,
  type WikiArticleEditableData,
  type WikiArticleProjectionRow,
} from "@gororobas/domain"
import { Match } from "effect"

import { bookToExternalDataInputs } from "./kinds/book-fetcher.js"
import { plantToExternalDataInputs } from "./kinds/plant-fetcher.js"

export const articleToExternalDataInputs = (
  article: WikiArticleEditableData | WikiArticleProjectionRow,
): ExternalDataInputs =>
  Match.value(article).pipe(
    Match.when({ kind: "PLANT" }, plantToExternalDataInputs),
    Match.when({ kind: "BOOK" }, bookToExternalDataInputs),
    Match.orElse(() => ({ kind: "NONE" as const })),
  )

export type ExternalDataArticle = (WikiArticleEditableData | WikiArticleProjectionRow) &
  Pick<WikiArticleProjectionRow, "id" | "currentCrdtFrontier">

export const buildExternalDataRequest = (
  article: ExternalDataArticle,
): ExternalDataFetchRequest => ({
  wikiArticleId: article.id,
  articleCrdtFrontier: article.currentCrdtFrontier,
  inputs: articleToExternalDataInputs(article),
})
