import { Style } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import type { Html } from "foldkit/html"

import { publicationKindLabels } from "../../../lib/vocabulary"
import { aboutName, ofName } from "../../../lib/wiki-article-names"
import { imageUrl } from "../../../media-urls"
import { AppText } from "../../../ui/app-text"
import * as Icons from "../../../ui/icons"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { PublicationCard } from "../../../ui/publication-card"
import { SectionCard } from "../../../ui/section-card"
import { radius, space } from "../../../ui/theme"
import type { WikiArticleViewBuilder } from "../composition"
import { Message } from "../message"
import { contributorList } from "./about"
import {
  type ImageAsset,
  type ArticleState,
  asyncView,
  caption,
  emptyState,
  filterChips,
  images,
  listStyle,
  sectionsStyle,
} from "./shared"

const featuredPhotoStyle = Style.make({ display: "grid", rowGap: space[1] })

const featuredImageStyle = Style.make({
  inlineSize: "100%",
  aspectRatio: "16 / 10",
  objectFit: "cover",
  borderRadius: radius.lg,
})

const masonryStyle = Style.make({ columnCount: 2, columnGap: space[3] })

const masonryItemStyle = Style.make({
  display: "grid",
  rowGap: space[1],
  marginBlockEnd: space[3],
  breakInside: "avoid",
})

const masonryImageStyle = Style.make({ inlineSize: "100%", borderRadius: radius.md })

const photoFigure = (
  {
    photo,
    imageStyle,
    figureStyle,
  }: Readonly<{
    photo: ImageAsset
    imageStyle: Style.Style
    figureStyle: Style.Style
  }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.keyed("figure")(photo.id, styledAttributes([], figureStyle), [
    h.img(
      styledAttributes(
        [
          h.Src(imageUrl(photo.id, 1280)),
          h.Alt(Option.getOrElse(caption(photo), () => "")),
          h.Attribute("loading", "lazy"),
        ],
        imageStyle,
      ),
    ),
    ...EffectArray.fromOption(
      Option.map(caption(photo), (text) =>
        h.figcaption(
          [],
          [AppText.view({ element: "span", appearance: "footnote", children: [text] }, h)],
        ),
      ),
    ),
  ])

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
          filterChips(
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
              onData: (all) =>
                EffectArray.match(
                  all.filter((publication) =>
                    Option.match(model.maybePublicationKindFilter, {
                      onNone: () => true,
                      onSome: (kind) => publication.kind === kind,
                    }),
                  ),
                  {
                    onEmpty: () => emptyState(`Ainda não há posts sobre ${aboutName(page)}.`, h),
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
  const all = images(page)
  const categories = EffectArray.dedupe(
    EffectArray.getSomes(all.map((photo) => Option.fromNullishOr(photo.category))),
  )

  const shown = all.filter((photo) =>
    Option.match(model.maybePhotoCategoryFilter, {
      onNone: () => true,
      onSome: (category) => photo.category === category,
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
                filterChips(
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
            onEmpty: () => emptyState("Nenhuma foto por aqui ainda.", h),
            onNonEmpty: ([featured, ...rest]) =>
              h.div(styledAttributes([], listStyle), [
                photoFigure(
                  {
                    photo: featured,
                    imageStyle: featuredImageStyle,
                    figureStyle: featuredPhotoStyle,
                  },
                  h,
                ),
                h.div(
                  styledAttributes([], masonryStyle),
                  rest.map((photo) =>
                    photoFigure(
                      {
                        photo: photo,
                        imageStyle: masonryImageStyle,
                        figureStyle: masonryItemStyle,
                      },
                      h,
                    ),
                  ),
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
              onData: (contributors) => contributorList({ contributors, size: "large" }, h),
            },
            h,
          ),
        ],
      },
      h,
    ),
  ])
