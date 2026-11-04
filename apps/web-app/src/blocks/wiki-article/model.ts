import { PopoverBlock } from "@foldkit/ui"
import { BookmarkState, PublicationKind } from "@gororobas/domain/common/enums"
import { ApiPublicationCardData } from "@gororobas/domain/publications/domain"
import {
  ExternalDataProvider,
  RelatedWikiArticle,
  WikiArticleExternalData,
  WikiArticleBookmarker,
  WikiArticleContributor,
  WikiArticleKind,
  WikiArticleLookup,
  WikiArticleQueriedCardData,
  WikiArticleQueriedPageData,
  WikiChildPlacesPage,
} from "@gororobas/domain/wiki/domain"
import { Schema } from "effect"
import { AsyncData } from "foldkit"
import { defineTaggedUnion } from "foldkit/schema"

import { ClientFailure } from "../../lib/client-failure"
import { ViewerBookmarks } from "../../lib/viewer-bookmarks"
import { DrawerBlock } from "../../ui/drawer/drawer"

export const PageResult = AsyncData.Schema(WikiArticleQueriedPageData, ClientFailure)
export const RelatedResults = AsyncData.Schema(Schema.Array(RelatedWikiArticle), ClientFailure)
export const BookmarkerResults = AsyncData.Schema(
  Schema.Array(WikiArticleBookmarker),
  ClientFailure,
)
export const ContributorResults = AsyncData.Schema(
  Schema.Array(WikiArticleContributor),
  ClientFailure,
)
export const CultivarResults = AsyncData.Schema(
  Schema.Array(WikiArticleQueriedCardData),
  ClientFailure,
)
/** The places inside a place, as many pages of them as the reader asked for. */
export const ChildPlaceResults = AsyncData.Schema(WikiChildPlacesPage, ClientFailure)
export const PublicationResults = AsyncData.Schema(
  Schema.Array(ApiPublicationCardData),
  ClientFailure,
)

/** Plants and books only; other kinds fetch nothing from providers. */
export const ExternalDataResults = AsyncData.Schema(WikiArticleExternalData, ClientFailure)

/** Each section showing provider data credits it in its own popover. */
export const ExternalDataSection = Schema.Literals(["Taxonomy", "Media", "Wikipedia", "Editions"])
export type ExternalDataSection = typeof ExternalDataSection.Type

export const externalDataSectionProviders: Readonly<
  Record<ExternalDataSection, typeof ExternalDataProvider.Type>
> = {
  Taxonomy: "GBIF",
  Media: "GBIF",
  Wikipedia: "WIKIDATA",
  Editions: "GOOGLE_BOOKS",
}

export const BookmarkSaving = defineTaggedUnion({
  Idle: {},
  Saving: {},
  Failed: { error: Schema.String },
})

export const Model = Schema.Struct({
  lookup: WikiArticleLookup,
  pageAsyncData: PageResult.schema,
  relatedAsyncData: RelatedResults.schema,
  bookmarkersAsyncData: BookmarkerResults.schema,
  contributorsAsyncData: ContributorResults.schema,
  /** Plants only; other kinds start with none. */
  cultivarsAsyncData: CultivarResults.schema,
  /** Places only; other kinds start with none. */
  childPlacesAsyncData: ChildPlaceResults.schema,
  publicationsAsyncData: PublicationResults.schema,
  externalDataAsyncData: ExternalDataResults.schema,
  attributionPopovers: Schema.Array(PopoverBlock.Model),
  viewerBookmarks: ViewerBookmarks,
  bookmarkSaving: BookmarkSaving,
  bookmarkPopover: PopoverBlock.Model,
  bookmarkDrawer: DrawerBlock.Model,
  maybeBookmarkerFilter: Schema.Option(BookmarkState),
  maybeRelatedKindFilter: Schema.Option(WikiArticleKind),
  maybePhotoCategoryFilter: Schema.Option(Schema.String),
  maybePublicationKindFilter: Schema.Option(PublicationKind),
})

export type Model = typeof Model.Type
