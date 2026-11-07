import { msg, select } from "@lingui/core/macro"
import { Array as EffectArray, Option } from "effect"
import type { Html } from "foldkit/html"

import { translateLabels, translatorFor } from "../../../lib/translations"
import { publicationKindLabels } from "../../../lib/vocabulary"
import { nameParts } from "../../../lib/wiki-article-names"
import { AppText } from "../../../ui/app-text"
import { EmptyState } from "../../../ui/empty-state"
import { FilterChips } from "../../../ui/filter-chips"
import * as Icons from "../../../ui/icons"
import { PhotoGallery } from "../../../ui/photo-gallery"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { PublicationCard } from "../../../ui/publication-card"
import { SectionCard } from "../../../ui/section-card"
import type { WikiArticleViewBuilder } from "../composition"
import { Message } from "../message"
import { contributorList } from "./about"
import { photoCredit } from "./attribution"
import { articlePhotos } from "./photos"
import { type ArticleState, asyncView, listStyle, sectionsStyle } from "./shared"

export const publications = (
  { model, language, page, maybeToday }: ArticleState,
  h: WikiArticleViewBuilder,
): Html => {
  const i18n = translatorFor(language)
  const { name, gender } = nameParts(page)
  const kindLabels = translateLabels(i18n, publicationKindLabels)

  return h.div(styledAttributes([], sectionsStyle), [
    SectionCard.view(
      {
        title: i18n._(msg`${select(gender, { other: `Posts about ${name}` })}`),
        icon: Icons.clipboard,
        isBare: true,
        children: [
          FilterChips.view(
            {
              label: i18n._(msg`Filter by format`),
              allLabel: i18n._(msg`All`),
              options: (["POST", "EVENT"] as const).map(
                (kind) => [kind, kindLabels[kind]] as const,
              ),
              selected: model.maybePublicationKindFilter,
              toMessage: (maybeKind) => Message.ClickedPublicationKindFilter({ maybeKind }),
            },
            h,
          ),
          asyncView(
            {
              i18n,
              asyncData: model.publicationsAsyncData,
              loading: {
                label: i18n._(msg`Loading publications`),
                skeleton: PublicationCard.skeletons(2, h),
              },
              onData: (all) =>
                EffectArray.match(
                  all.filter((publication) =>
                    Option.match(model.maybePublicationKindFilter, {
                      onNone: () => true,
                      onSome: (kind) => publication.kind === kind,
                    }),
                  ),
                  {
                    onEmpty: () =>
                      EmptyState.view(
                        {
                          icon: Icons.clipboard,
                          title: i18n._(
                            msg`${select(gender, { other: `No posts about ${name} yet` })}`,
                          ),
                          maybeDescription: Option.some(
                            i18n._(msg`When someone shares an experience, it shows up here.`),
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
                  },
                ),
            },
            h,
          ),
        ],
      },
      h,
    ),
  ])
}

export const photos = (
  { model, language, page }: ArticleState,
  h: WikiArticleViewBuilder,
): Html => {
  const i18n = translatorFor(language)
  const { name, gender } = nameParts(page)
  const all = articlePhotos(page)
  const categories = EffectArray.dedupe(
    EffectArray.getSomes(all.map((photo) => photo.maybeCategory)),
  )

  const shown = all.filter((photo) =>
    Option.match(model.maybePhotoCategoryFilter, {
      onNone: () => true,
      onSome: (category) => Option.contains(photo.maybeCategory, category),
    }),
  )

  return h.div(styledAttributes([], sectionsStyle), [
    SectionCard.view(
      {
        title: i18n._(msg`${select(gender, { other: `Photos of ${name}` })}`),
        icon: Icons.gallery,
        isBare: true,
        children: [
          ...(EffectArray.isReadonlyArrayNonEmpty(categories)
            ? [
                FilterChips.view(
                  {
                    label: i18n._(msg`Filter by category`),
                    allLabel: i18n._(msg`All`),
                    options: categories.map((category) => [category, category] as const),
                    selected: model.maybePhotoCategoryFilter,
                    toMessage: (maybeCategory) =>
                      Message.ClickedPhotoCategoryFilter({ maybeCategory }),
                  },
                  h,
                ),
              ]
            : []),
          EffectArray.match(shown, {
            onEmpty: () =>
              EmptyState.view(
                { icon: Icons.gallery, title: i18n._(msg`No photos here yet`), size: "roomy" },
                h,
              ),
            onNonEmpty: ([featured, ...rest]) =>
              h.div(styledAttributes([], listStyle), [
                PhotoGallery.figure(
                  {
                    photo: featured,
                    isFeatured: true,
                    overlay: (photo) => photoCredit({ model, language, photo }, h),
                  },
                  h,
                ),
                PhotoGallery.masonry(
                  {
                    photos: rest,
                    columnCount: model.photoColumnCount,
                    overlay: (photo) => photoCredit({ model, language, photo }, h),
                  },
                  h,
                ),
              ]),
          }),
        ],
      },
      h,
    ),
  ])
}

export const contributions = (
  { model, language, page }: ArticleState,
  h: WikiArticleViewBuilder,
): Html => {
  const i18n = translatorFor(language)
  const { name, gender } = nameParts(page)

  return h.div(styledAttributes([], sectionsStyle), [
    SectionCard.view(
      {
        title: i18n._(msg`Contributions`),
        icon: Icons.users,
        isBare: true,
        children: [
          AppText.view(
            {
              element: "p",
              children: [
                i18n._(
                  msg`${select(gender, { other: `Gororobas is collaborative: each person below helped build the page of ${name}.` })}`,
                ),
              ],
            },
            h,
          ),
          asyncView(
            {
              i18n,
              asyncData: model.contributorsAsyncData,
              loading: { label: i18n._(msg`Loading contributions`), shape: "rows" },
              onData: (contributors) =>
                contributorList({ contributors, language, size: "large" }, h),
            },
            h,
          ),
        ],
      },
      h,
    ),
  ])
}
