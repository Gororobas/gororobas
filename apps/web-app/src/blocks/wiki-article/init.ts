import type {
  WikiArticleExternalData,
  WikiArticleKind,
  WikiArticleLookup,
} from "@gororobas/domain/wiki/domain"
import { HashMap, Option } from "effect"

import {
  LoadBookmarkers,
  LoadChildPlaces,
  LoadContributors,
  LoadCultivars,
  LoadExternalData,
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
  ExternalDataResults,
  PageResult,
  PublicationResults,
  RelatedResults,
} from "./model"

const hasExternalData = (kind: WikiArticleKind) => kind === "PLANT" || kind === "BOOK"

const emptyExternalData: WikiArticleExternalData = {
  attributions: [],
  wikipediaLinks: [],
  taxonomy: null,
  media: [],
  bookEditions: [],
}

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
    externalDataAsyncData: hasExternalData(lookup.kind)
      ? ExternalDataResults.Loading()
      : ExternalDataResults.Success({ data: emptyExternalData }),
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
    ...(hasExternalData(lookup.kind) ? [LoadExternalData({ lookup })] : []),
  ],
}))
