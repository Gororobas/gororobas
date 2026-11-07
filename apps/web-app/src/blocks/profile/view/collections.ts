import type { PublicationKind } from "@gororobas/domain/common/enums"
import type { MessageDescriptor } from "@lingui/core"
import { msg, plural } from "@lingui/core/macro"
import { Array as EffectArray, Option } from "effect"
import type { Html } from "foldkit/html"

import { type Translator, translatorFor } from "../../../lib/translations"
import {
  profileBookmarkStateLabels,
  publicationKindLabels,
  wikiKindLabels,
} from "../../../lib/vocabulary"
import { AppText } from "../../../ui/app-text"
import { EmptyState } from "../../../ui/empty-state"
import { FilterChips } from "../../../ui/filter-chips"
import * as Icons from "../../../ui/icons"
import { PhotoGallery } from "../../../ui/photo-gallery"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { PublicationCard } from "../../../ui/publication-card"
import { SectionCard } from "../../../ui/section-card"
import { WikiArticleRow } from "../../../ui/wiki-article-row"
import type { ProfileViewBuilder } from "../composition"
import { Message } from "../message"
import {
  type ProfileState,
  cardGridStyle,
  galleryPhotos,
  listStyle,
  pagedView,
  photoCredit,
  sectionsStyle,
} from "./shared"

const noPublicationsOfKind: Readonly<Record<PublicationKind, MessageDescriptor>> = {
  POST: msg`No posts here yet`,
  EVENT: msg`No events here yet`,
}

const bookmarkStates = ["INTERESTED", "ACTIVE", "PREVIOUSLY_ACTIVE"] as const

/** "3 approved edits". */
export const contributionSummary = ({
  revisionCount,
  i18n,
}: Readonly<{ revisionCount: number; i18n: Translator }>): string =>
  i18n._(msg`${plural(revisionCount, { one: "# approved edit", other: "# approved edits" })}`)

const page = (
  {
    title,
    icon,
    children,
  }: Readonly<{ title: string; icon: (typeof Icons)["clipboard"]; children: ReadonlyArray<Html> }>,
  h: ProfileViewBuilder,
): Html =>
  h.div(styledAttributes([], sectionsStyle), [
    SectionCard.view({ title, icon, isBare: true, children }, h),
  ])

export const publications = (
  { model, language, page: profile, maybeToday }: ProfileState,
  h: ProfileViewBuilder,
): Html => {
  const i18n = translatorFor(language)
  const name = profile.name

  return page(
    {
      title: i18n._(msg`Publications by ${name}`),
      icon: Icons.clipboard,
      children: [
        FilterChips.view(
          {
            label: i18n._(msg`Filter by format`),
            allLabel: i18n._(msg`All`),
            options: (["POST", "EVENT"] as const).map(
              (kind) => [kind, i18n._(publicationKindLabels[kind])] as const,
            ),
            selected: model.maybePublicationKindFilter,
            toMessage: (maybeKind) => Message.ClickedPublicationKindFilter({ maybeKind }),
          },
          h,
        ),
        pagedView(
          {
            i18n,
            collection: "Publications",
            asyncData: model.publicationsAsyncData,
            loading: {
              label: i18n._(msg`Loading publications`),
              skeleton: PublicationCard.skeletons(2, h),
            },
            onItems: (all) =>
              EffectArray.match(all, {
                onEmpty: () =>
                  EmptyState.view(
                    {
                      icon: Icons.clipboard,
                      title: Option.match(model.maybePublicationKindFilter, {
                        onNone: () => i18n._(msg`${name} hasn't published here yet`),
                        onSome: (kind) => i18n._(noPublicationsOfKind[kind]),
                      }),
                      maybeDescription: Option.some(
                        i18n._(msg`Posts and events show up here as soon as they're shared.`),
                      ),
                      size: "roomy",
                    },
                    h,
                  ),
                onNonEmpty: (shown) =>
                  h.div(
                    styledAttributes([], listStyle),
                    shown.map((publication) =>
                      h.keyed("div")(
                        publication.id,
                        [],
                        [PublicationCard.view({ language, publication, maybeToday }, h)],
                      ),
                    ),
                  ),
              }),
          },
          h,
        ),
      ],
    },
    h,
  )
}

export const photos = (
  { model, language, page: profile }: ProfileState,
  h: ProfileViewBuilder,
): Html => {
  const i18n = translatorFor(language)
  const name = profile.name

  return page(
    {
      title: i18n._(msg`Photos by ${name}`),
      icon: Icons.gallery,
      children: [
        pagedView(
          {
            i18n,
            collection: "Photos",
            asyncData: model.photosAsyncData,
            loading: { label: i18n._(msg`Loading photos`), shape: "tiles", count: 6 },
            onItems: (media) =>
              EffectArray.match(galleryPhotos({ media, language }), {
                onEmpty: () =>
                  EmptyState.view(
                    {
                      icon: Icons.gallery,
                      title: i18n._(msg`No photos here yet`),
                      maybeDescription: Option.some(
                        i18n._(msg`Photos ${name} took show up here once they're shared.`),
                      ),
                      size: "roomy",
                    },
                    h,
                  ),
                onNonEmpty: (shown) =>
                  PhotoGallery.masonry(
                    {
                      photos: shown,
                      columnCount: model.photoColumnCount,
                      overlay: (photo) => photoCredit({ model, photo, i18n }, h),
                    },
                    h,
                  ),
              }),
          },
          h,
        ),
      ],
    },
    h,
  )
}

export const contributions = (
  { model, language, page: profile }: ProfileState,
  h: ProfileViewBuilder,
): Html => {
  const i18n = translatorFor(language)
  const name = profile.name

  return page(
    {
      title: i18n._(msg`Encyclopedia contributions`),
      icon: Icons.encyclopedia,
      children: [
        AppText.view(
          {
            element: "p",
            children: [i18n._(msg`Articles ${name} helped write, with approved edits.`)],
          },
          h,
        ),
        pagedView(
          {
            i18n,
            collection: "Contributions",
            asyncData: model.contributionsAsyncData,
            loading: { label: i18n._(msg`Loading contributions`), shape: "rows" },
            onItems: (all) =>
              EffectArray.match(all, {
                onEmpty: () =>
                  EmptyState.view(
                    {
                      icon: Icons.encyclopedia,
                      title: i18n._(msg`No encyclopedia contributions yet`),
                      maybeDescription: Option.some(
                        i18n._(msg`Every encyclopedia page welcomes suggested edits.`),
                      ),
                      size: "roomy",
                    },
                    h,
                  ),
                onNonEmpty: (shown) =>
                  h.div(
                    styledAttributes([], listStyle),
                    shown.map((contribution) =>
                      h.keyed("div")(
                        contribution.article.id,
                        [],
                        [
                          WikiArticleRow.view(
                            {
                              article: contribution.article,
                              language,
                              maybeSubtitle: Option.some(
                                contributionSummary({ ...contribution, i18n }),
                              ),
                            },
                            h,
                          ),
                        ],
                      ),
                    ),
                  ),
              }),
          },
          h,
        ),
      ],
    },
    h,
  )
}

export const bookmarks = (
  { model, language, page: profile }: ProfileState,
  h: ProfileViewBuilder,
): Html => {
  const i18n = translatorFor(language)
  const name = profile.name

  return page(
    {
      title: i18n._(msg`Saved by ${name}`),
      icon: Icons.bookmark,
      children: profile.areBookmarksVisible
        ? [
            ...(profile.bookmarkedKinds.length > 1
              ? [
                  FilterChips.view(
                    {
                      label: i18n._(msg`Filter by kind`),
                      allLabel: i18n._(msg`All`),
                      options: profile.bookmarkedKinds.map(
                        (kind) => [kind, i18n._(wikiKindLabels[kind].plural)] as const,
                      ),
                      selected: model.maybeBookmarkKindFilter,
                      toMessage: (maybeKind) => Message.ClickedBookmarkKindFilter({ maybeKind }),
                    },
                    h,
                  ),
                ]
              : []),
            FilterChips.view(
              {
                label: i18n._(msg`Filter by status`),
                allLabel: i18n._(msg`All`),
                options: bookmarkStates.map(
                  (state) => [state, i18n._(profileBookmarkStateLabels[state])] as const,
                ),
                selected: model.maybeBookmarkStateFilter,
                toMessage: (maybeState) => Message.ClickedBookmarkStateFilter({ maybeState }),
              },
              h,
            ),
            pagedView(
              {
                i18n,
                collection: "Bookmarks",
                asyncData: model.bookmarksAsyncData,
                loading: { label: i18n._(msg`Loading saved articles`), shape: "tiles", count: 6 },
                onItems: (shown) =>
                  EffectArray.match(shown, {
                    onEmpty: () =>
                      EmptyState.view(
                        {
                          icon: Icons.bookmark,
                          title: i18n._(msg`Nothing saved here yet`),
                          maybeDescription: Option.some(
                            i18n._(
                              msg`Plants, books and places someone wants to get to know or already lives with show up here.`,
                            ),
                          ),
                          size: "roomy",
                        },
                        h,
                      ),
                    onNonEmpty: (nonEmpty) =>
                      h.div(
                        styledAttributes([], cardGridStyle),
                        nonEmpty.map((bookmark) =>
                          h.keyed("div")(
                            bookmark.article.id,
                            [],
                            [
                              WikiArticleRow.view(
                                {
                                  article: bookmark.article,
                                  language,
                                  maybeBookmarkState: Option.some(bookmark.state),
                                  isCard: true,
                                },
                                h,
                              ),
                            ],
                          ),
                        ),
                      ),
                  }),
              },
              h,
            ),
          ]
        : [
            EmptyState.view(
              {
                icon: Icons.lock,
                title: i18n._(msg`${name} keeps what they save to themselves`),
                size: "roomy",
              },
              h,
            ),
          ],
    },
    h,
  )
}
