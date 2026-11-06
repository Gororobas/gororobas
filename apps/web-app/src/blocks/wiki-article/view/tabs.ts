import { Array as EffectArray, Option } from "effect"
import type { Html } from "foldkit/html"

import { publicationKindLabels } from "../../../lib/vocabulary"
import { aboutName, ofName } from "../../../lib/wiki-article-names"
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
  { model, page, maybeToday }: ArticleState,
  h: WikiArticleViewBuilder,
): Html =>
  h.div(styledAttributes([], sectionsStyle), [
    SectionCard.view(
      {
        title: `Posts sobre ${aboutName(page)}`,
        icon: Icons.clipboard,
        isBare: true,
        children: [
          FilterChips.view(
            {
              label: "Filtrar por formato",
              options: (["POST", "EVENT"] as const).map(
                (kind) => [kind, publicationKindLabels[kind]] as const,
              ),
              selected: model.maybePublicationKindFilter,
              toMessage: (maybeKind) => Message.ClickedPublicationKindFilter({ maybeKind }),
            },
            h,
          ),
          asyncView(
            {
              asyncData: model.publicationsAsyncData,
              loading: { label: "Carregando posts", shape: "cards" },
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
                          title: `Ainda não há posts sobre ${aboutName(page)}`,
                          maybeDescription: Option.some(
                            "Quando alguém compartilhar uma experiência, ela aparece aqui.",
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
                            [PublicationCard.view({ publication, maybeToday }, h)],
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

export const photos = ({ model, page }: ArticleState, h: WikiArticleViewBuilder): Html => {
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
        title: `Fotos ${ofName(page)}`,
        icon: Icons.gallery,
        isBare: true,
        children: [
          ...(EffectArray.isReadonlyArrayNonEmpty(categories)
            ? [
                FilterChips.view(
                  {
                    label: "Filtrar por categoria",
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
                { icon: Icons.gallery, title: "Nenhuma foto por aqui ainda", size: "roomy" },
                h,
              ),
            onNonEmpty: ([featured, ...rest]) =>
              h.div(styledAttributes([], listStyle), [
                PhotoGallery.figure(
                  {
                    photo: featured,
                    isFeatured: true,
                    overlay: (photo) => photoCredit({ model, photo }, h),
                  },
                  h,
                ),
                PhotoGallery.masonry(
                  {
                    photos: rest,
                    columnCount: model.photoColumnCount,
                    overlay: (photo) => photoCredit({ model, photo }, h),
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

export const contributions = ({ model, page }: ArticleState, h: WikiArticleViewBuilder): Html =>
  h.div(styledAttributes([], sectionsStyle), [
    SectionCard.view(
      {
        title: "Contribuições",
        icon: Icons.users,
        isBare: true,
        children: [
          AppText.view(
            {
              element: "p",
              children: [
                `O Gororobas é colaborativo: cada pessoa abaixo ajudou a construir a página ${ofName(page)}.`,
              ],
            },
            h,
          ),
          asyncView(
            {
              asyncData: model.contributorsAsyncData,
              loading: { label: "Carregando contribuições", shape: "rows" },
              onData: (contributors) => contributorList({ contributors, size: "large" }, h),
            },
            h,
          ),
        ],
      },
      h,
    ),
  ])
