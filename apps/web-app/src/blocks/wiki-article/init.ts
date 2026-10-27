import type { WikiArticleLookup } from "@gororobas/domain/wiki/domain"
import { HashMap, Option } from "effect"

import { LoadBookmarkers, LoadContributors, LoadCultivars, LoadPage, LoadRelated } from "./command"
import { WikiArticleComposition } from "./composition"
import {
  BookmarkSaving,
  BookmarkerResults,
  ContributorResults,
  CultivarResults,
  PageResult,
  PublicationResults,
  RelatedResults,
} from "./model"

export const init = WikiArticleComposition.makeInit((lookup: WikiArticleLookup) => ({
  model: {
    lookup,
    pageAsyncData: PageResult.Loading(),
    relatedAsyncData: RelatedResults.Loading(),
    bookmarkersAsyncData: BookmarkerResults.Loading(),
    contributorsAsyncData: ContributorResults.Loading(),
    cultivarsAsyncData:
      lookup.kind === "PLANT" ? CultivarResults.Loading() : CultivarResults.Success({ data: [] }),
    publicationsAsyncData: PublicationResults.Loading(),
    viewerBookmarks: HashMap.empty(),
    bookmarkSaving: BookmarkSaving.Idle(),
    maybeBookmarkerFilter: Option.none(),
    maybeRelatedKindFilter: Option.none(),
    maybePhotoCategoryFilter: Option.none(),
    maybePublicationKindFilter: Option.none(),
  },
  commands: [
    LoadPage({ lookup }),
    LoadRelated({ lookup }),
    LoadBookmarkers({ lookup }),
    LoadContributors({ lookup }),
    ...(lookup.kind === "PLANT" ? [LoadCultivars({ lookup })] : []),
  ],
}))
