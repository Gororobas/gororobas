import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import { PROFILE_COLLECTION_PAGE_SIZE } from "@gororobas/domain/profiles/profile-page"
import { Array as EffectArray, Match, Option } from "effect"
import { AsyncData, Update } from "foldkit"
import { initAndAppend } from "foldkit/binding"
import { modifyFields } from "foldkit/struct"

import type { ClientFailure } from "../../lib/client-failure"
import {
  LoadBookmarks,
  LoadContributions,
  LoadPhotos,
  LoadPublications,
  PUBLICATIONS_PAGE_SIZE,
} from "./command"
import { PhotoCreditsBinding, ProfileComposition, photoCreditId } from "./composition"
import { makeFieldsStep, makeStep } from "./definition"
import {
  BookmarkResults,
  type Collection,
  ContributionResults,
  type Model,
  PageResult,
  PhotoResults,
  PublicationResults,
} from "./model"

type Paged<Item> = Readonly<{
  items: ReadonlyArray<Item>
  loadedPageCount: number
  hasMore: boolean
}>

type PagedAsyncData<Item> = AsyncData.AsyncData<Paged<Item>, ClientFailure>

/** The first page replaces what was loaded, as its filters changed; later pages append. */
const withPage = <Item>(
  current: PagedAsyncData<Item>,
  {
    items,
    currentPage,
    pageSize,
  }: Readonly<{ items: ReadonlyArray<Item>; currentPage: number; pageSize: number }>,
): Paged<Item> => ({
  items:
    currentPage === 0
      ? items
      : [
          ...Option.match(AsyncData.getData(current), {
            onNone: () => [],
            onSome: (data) => data.items,
          }),
          ...items,
        ],
  loadedPageCount: currentPage + 1,
  hasMore: items.length >= pageSize,
})

/** A later page's failure keeps what had loaded, so the reader can scroll back to retry. */
const withFailure = <Item>(
  current: PagedAsyncData<Item>,
  error: ClientFailure,
): PagedAsyncData<Item> =>
  Option.match(AsyncData.getData(current), {
    onNone: () => AsyncData.Failure({ error }),
    onSome: (data) => AsyncData.Stale({ error, data }),
  })

/** The page after the loaded ones, unless it's loading already or there's none. */
const nextPage = <Item>(asyncData: PagedAsyncData<Item>): Option.Option<Paged<Item>> =>
  Option.filter(
    AsyncData.getData(asyncData),
    (data) => data.hasMore && !AsyncData.isRefreshing(asyncData),
  )

const ownerProfileId = (model: Model) =>
  Option.map(AsyncData.getData(model.pageAsyncData), (page) => page.id)

const loadPublicationsStep = (language: SupportedLanguage, currentPage: number) =>
  makeStep((model) =>
    Option.match(ownerProfileId(model), {
      onNone: () => ({ model }),
      onSome: (profileId) => ({
        model,
        commands: [
          LoadPublications({
            ownerProfileId: profileId,
            language,
            maybeKind: model.maybePublicationKindFilter,
            currentPage,
          }),
        ],
      }),
    }),
  )

const loadBookmarksCommand = (
  model: Model,
  { language, currentPage }: Readonly<{ language: SupportedLanguage; currentPage: number }>,
) =>
  LoadBookmarks({
    handle: model.handle,
    language,
    maybeKind: model.maybeBookmarkKindFilter,
    maybeState: model.maybeBookmarkStateFilter,
    currentPage,
  })

/** Starts over from the first page, as the bookmark filters changed. */
const reloadBookmarksStep = (language: SupportedLanguage) =>
  makeStep((model) => ({
    model: modifyFields(model, { bookmarksAsyncData: () => BookmarkResults.Loading() }),
    commands: [loadBookmarksCommand(model, { language, currentPage: 0 })],
  }))

const loadNextPageStep = (language: SupportedLanguage, collection: Collection) =>
  makeStep((model) =>
    Match.value(collection).pipe(
      Match.when("Publications", () =>
        Option.match(nextPage(model.publicationsAsyncData), {
          onNone: () => ({ model }),
          onSome: (data) =>
            loadPublicationsStep(
              language,
              data.loadedPageCount,
            )(
              modifyFields(model, {
                publicationsAsyncData: () => PublicationResults.Refreshing({ data }),
              }),
            ),
        }),
      ),
      Match.when("Photos", () =>
        Option.match(nextPage(model.photosAsyncData), {
          onNone: () => ({ model }),
          onSome: (data) => ({
            model: modifyFields(model, {
              photosAsyncData: () => PhotoResults.Refreshing({ data }),
            }),
            commands: [LoadPhotos({ handle: model.handle, currentPage: data.loadedPageCount })],
          }),
        }),
      ),
      Match.when("Contributions", () =>
        Option.match(nextPage(model.contributionsAsyncData), {
          onNone: () => ({ model }),
          onSome: (data) => ({
            model: modifyFields(model, {
              contributionsAsyncData: () => ContributionResults.Refreshing({ data }),
            }),
            commands: [
              LoadContributions({
                handle: model.handle,
                language,
                currentPage: data.loadedPageCount,
              }),
            ],
          }),
        }),
      ),
      Match.when("Bookmarks", () =>
        Option.match(nextPage(model.bookmarksAsyncData), {
          onNone: () => ({ model }),
          onSome: (data) => ({
            model: modifyFields(model, {
              bookmarksAsyncData: () => BookmarkResults.Refreshing({ data }),
            }),
            commands: [
              loadBookmarksCommand(model, { language, currentPage: data.loadedPageCount }),
            ],
          }),
        }),
      ),
      Match.exhaustive,
    ),
  )

export const update = ProfileComposition.makeUpdate.withContext((language: SupportedLanguage) => ({
  SucceededLoadPage: (model, { page }) =>
    Update.combineSteps([
      makeFieldsStep(() => ({
        pageAsyncData: () => PageResult.Success({ data: page }),
        bookmarksAsyncData: () =>
          page.areBookmarksVisible ? BookmarkResults.Loading() : BookmarkResults.Idle(),
      })),
      loadPublicationsStep(language, 0),
      makeStep((stepModel) => ({
        model: stepModel,
        commands: page.areBookmarksVisible
          ? [loadBookmarksCommand(stepModel, { language, currentPage: 0 })]
          : [],
      })),
    ])(model),
  FailedLoadPage: makeFieldsStep.fromMessage(({ error }) => ({
    pageAsyncData: () => PageResult.Failure({ error }),
    publicationsAsyncData: () => PublicationResults.Idle(),
    bookmarksAsyncData: () => BookmarkResults.Idle(),
  })),
  SucceededLoadPublications: makeFieldsStep.fromMessage(({ publications, currentPage }) => ({
    publicationsAsyncData: (current) =>
      PublicationResults.Success({
        data: withPage(current, {
          items: publications,
          currentPage,
          pageSize: PUBLICATIONS_PAGE_SIZE,
        }),
      }),
  })),
  FailedLoadPublications: makeFieldsStep.fromMessage(({ error }) => ({
    publicationsAsyncData: (current) => withFailure(current, error),
  })),
  SucceededLoadPhotos: (model, { photos, currentPage }) =>
    Update.combineSteps([
      makeFieldsStep(() => ({
        photosAsyncData: (current) =>
          PhotoResults.Success({
            data: withPage(current, {
              items: photos,
              currentPage,
              pageSize: PROFILE_COLLECTION_PAGE_SIZE,
            }),
          }),
      })),
      ...EffectArray.dedupe(photos.map((photo) => photoCreditId(photo.id)))
        .filter((creditId) => !model.photoCredits.some((credit) => credit.id === creditId))
        .map((creditId) =>
          makeStep((stepModel) =>
            initAndAppend(PhotoCreditsBinding, stepModel, {
              key: creditId,
              args: [{ id: creditId }],
            }),
          ),
        ),
    ])(model),
  FailedLoadPhotos: makeFieldsStep.fromMessage(({ error }) => ({
    photosAsyncData: (current) => withFailure(current, error),
  })),
  SucceededLoadContributions: makeFieldsStep.fromMessage(({ contributions, currentPage }) => ({
    contributionsAsyncData: (current) =>
      ContributionResults.Success({
        data: withPage(current, {
          items: contributions,
          currentPage,
          pageSize: PROFILE_COLLECTION_PAGE_SIZE,
        }),
      }),
  })),
  FailedLoadContributions: makeFieldsStep.fromMessage(({ error }) => ({
    contributionsAsyncData: (current) => withFailure(current, error),
  })),
  SucceededLoadBookmarks: makeFieldsStep.fromMessage(({ bookmarks, currentPage }) => ({
    bookmarksAsyncData: (current) =>
      BookmarkResults.Success({
        data: withPage(current, {
          items: bookmarks,
          currentPage,
          pageSize: PROFILE_COLLECTION_PAGE_SIZE,
        }),
      }),
  })),
  FailedLoadBookmarks: makeFieldsStep.fromMessage(({ error }) => ({
    bookmarksAsyncData: (current) => withFailure(current, error),
  })),
  ReachedCollectionEnd: (model, { collection }) => loadNextPageStep(language, collection)(model),
  ClickedPublicationKindFilter: (model, { maybeKind }) =>
    Update.combineSteps([
      makeFieldsStep(() => ({
        maybePublicationKindFilter: () => maybeKind,
        publicationsAsyncData: () => PublicationResults.Loading(),
      })),
      loadPublicationsStep(language, 0),
    ])(model),
  ClickedBookmarkStateFilter: (model, { maybeState }) =>
    Update.combineSteps([
      makeFieldsStep(() => ({ maybeBookmarkStateFilter: () => maybeState })),
      reloadBookmarksStep(language),
    ])(model),
  ClickedBookmarkKindFilter: (model, { maybeKind }) =>
    Update.combineSteps([
      makeFieldsStep(() => ({ maybeBookmarkKindFilter: () => maybeKind })),
      reloadBookmarksStep(language),
    ])(model),
  ChangedPhotoColumnCount: makeFieldsStep.fromMessage(({ columnCount }) => ({
    photoColumnCount: () => columnCount,
  })),
}))
