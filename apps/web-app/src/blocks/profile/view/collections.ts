import { Array as EffectArray, Option } from "effect"
import type { Html } from "foldkit/html"

import { profileBookmarkStateLabels, publicationKindLabels } from "../../../lib/vocabulary"
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
  asyncView,
  cardGridStyle,
  galleryPhotos,
  listStyle,
  sectionsStyle,
} from "./shared"

const bookmarkStates = ["INTERESTED", "ACTIVE", "PREVIOUSLY_ACTIVE"] as const

/** "3 edições, a última em 2026-04". */
export const contributionSummary = ({
  revisionCount,
}: Readonly<{ revisionCount: number }>): string =>
  `${revisionCount} ${revisionCount === 1 ? "edição aprovada" : "edições aprovadas"}`

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
  { model, page: profile, maybeToday }: ProfileState,
  h: ProfileViewBuilder,
): Html =>
  page(
    {
      title: `Publicações de ${profile.name}`,
      icon: Icons.clipboard,
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
            loading: { label: "Carregando publicações", shape: "cards" },
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
                        title: `${profile.name} ainda não publicou por aqui`,
                        maybeDescription: Option.some(
                          "Posts e eventos aparecem aqui assim que forem compartilhados.",
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
  )

export const photos = ({ model, page: profile }: ProfileState, h: ProfileViewBuilder): Html =>
  page(
    {
      title: `Fotos de ${profile.name}`,
      icon: Icons.gallery,
      children: [
        asyncView(
          {
            asyncData: model.photosAsyncData,
            loading: { label: "Carregando fotos", shape: "tiles", count: 6 },
            onData: (media) =>
              EffectArray.match(galleryPhotos(media), {
                onEmpty: () =>
                  EmptyState.view(
                    {
                      icon: Icons.gallery,
                      title: "Nenhuma foto por aqui ainda",
                      maybeDescription: Option.some(
                        "Fotos enviadas para a enciclopédia ou em publicações aparecem aqui.",
                      ),
                      size: "roomy",
                    },
                    h,
                  ),
                onNonEmpty: (shown) =>
                  PhotoGallery.masonry({ photos: shown, columnCount: model.photoColumnCount }, h),
              }),
          },
          h,
        ),
      ],
    },
    h,
  )

export const contributions = (
  { model, page: profile }: ProfileState,
  h: ProfileViewBuilder,
): Html =>
  page(
    {
      title: "Contribuições na enciclopédia",
      icon: Icons.encyclopedia,
      children: [
        AppText.view(
          {
            element: "p",
            children: [`Artigos que ${profile.name} ajudou a escrever, com edições aprovadas.`],
          },
          h,
        ),
        asyncView(
          {
            asyncData: model.contributionsAsyncData,
            loading: { label: "Carregando contribuições", shape: "rows" },
            onData: (all) =>
              EffectArray.match(all, {
                onEmpty: () =>
                  EmptyState.view(
                    {
                      icon: Icons.encyclopedia,
                      title: "Nenhuma contribuição na enciclopédia ainda",
                      maybeDescription: Option.some(
                        "Toda página da enciclopédia aceita sugestões de edição.",
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
                              maybeSubtitle: Option.some(contributionSummary(contribution)),
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

export const bookmarks = ({ model, page: profile }: ProfileState, h: ProfileViewBuilder): Html =>
  page(
    {
      title: `Salvos por ${profile.name}`,
      icon: Icons.bookmark,
      children: [
        FilterChips.view(
          {
            label: "Filtrar por situação",
            options: bookmarkStates.map(
              (state) => [state, profileBookmarkStateLabels[state]] as const,
            ),
            selected: model.maybeBookmarkStateFilter,
            toMessage: (maybeState) => Message.ClickedBookmarkStateFilter({ maybeState }),
          },
          h,
        ),
        asyncView(
          {
            asyncData: model.bookmarksAsyncData,
            loading: { label: "Carregando salvos", shape: "tiles", count: 6 },
            onData: (all) =>
              EffectArray.match(
                all.filter((bookmark) =>
                  Option.match(model.maybeBookmarkStateFilter, {
                    onNone: () => true,
                    onSome: (state) => bookmark.state === state,
                  }),
                ),
                {
                  onEmpty: () =>
                    EmptyState.view(
                      {
                        icon: Icons.bookmark,
                        title: "Nada salvo por aqui ainda",
                        maybeDescription: Option.some(
                          "Plantas, livros e lugares que alguém quer conhecer ou já vive aparecem aqui.",
                        ),
                        size: "roomy",
                      },
                      h,
                    ),
                  onNonEmpty: (shown) =>
                    h.div(
                      styledAttributes([], cardGridStyle),
                      shown.map((bookmark) =>
                        h.keyed("div")(
                          bookmark.article.id,
                          [],
                          [
                            WikiArticleRow.view(
                              {
                                article: bookmark.article,
                                maybeBookmarkState: Option.some(bookmark.state),
                                isCard: true,
                              },
                              h,
                            ),
                          ],
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
  )
