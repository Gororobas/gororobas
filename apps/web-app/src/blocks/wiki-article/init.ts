import type { WikiArticleLookup } from "@gororobas/domain/wiki/domain"
import { HashMap, Option } from "effect"

import {
  LoadBookmarkers,
  LoadChildPlaces,
  LoadContributors,
  LoadCultivars,
  LoadPage,
  LoadRelated,
} from "./command"
import { WikiArticleComposition } from "./composition"
import {
  BookmarkSaving,
  BookmarkerResults,
  ChildPlaceResults,
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
    childPlacesAsyncData:
      lookup.kind === "PLACE"
        ? ChildPlaceResults.Loading()
        : ChildPlaceResults.Success({ data: { places: [], totalCount: 0 } }),
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
    ...(lookup.kind === "PLACE" ? [LoadChildPlaces({ lookup, currentPage: 0 })] : []),
  ],
}))
