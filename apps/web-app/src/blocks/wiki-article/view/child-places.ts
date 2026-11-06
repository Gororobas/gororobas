import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { WikiChildPlace } from "@gororobas/domain/wiki/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { wikiArticleUrl } from "../../../app/route"
import { inPreposition, primaryName } from "../../../lib/wiki-article-names"
import { AppButton } from "../../../ui/app-button"
import { AppText } from "../../../ui/app-text"
import { EmptyState } from "../../../ui/empty-state"
import * as Icons from "../../../ui/icons"
import * as PlaceOutline from "../../../ui/place-outline/view"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { SectionCard } from "../../../ui/section-card"
import { focusRingDeclarations } from "../../../ui/styles/focus-ring"
import { radius, space, toneColors, tones } from "../../../ui/theme"
import type { WikiArticleViewBuilder } from "../composition"
import { Message } from "../message"
import type { Model } from "../model"
import { type Page, asyncView } from "./shared"

type PlacePage = Extract<Page, { kind: "PLACE" }>

const gridStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(8.5rem, 1fr))",
  gap: space[3],
})

const cardStyle = Style.make({
  display: "grid",
  rowGap: space[2],
  padding: space[2],
  borderRadius: radius.lg,
  color: toneColors.foreground,
  outline: "none",
}).pipe(
  Style.when(When.hover, { backgroundColor: tones.neutral.shade[100] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const nameStyle = Style.make({ textAlign: "center", overflowWrap: "anywhere" })

/** Holds a card's place while the gazetteer has no outline for it. */
const missingOutlineStyle = Style.make({
  aspectRatio: "1",
  borderRadius: radius.md,
  backgroundColor: tones.neutral.shade[200],
})

const footerStyle = Style.make({
  display: "grid",
  justifyItems: "center",
  rowGap: space[2],
  marginBlockStart: space[4],
})

/** A child place's outline, drawn inside the place whose page this is so readers see where it lies. */
const childCard = (
  {
    child,
    language,
    page,
  }: Readonly<{ child: WikiChildPlace; language: SupportedLanguage; page: PlacePage }>,
  h: WikiArticleViewBuilder,
): Html => {
  const name = primaryName(child.card)

  return h.keyed("a")(
    child.card.id,
    styledAttributes([h.Href(wikiArticleUrl(language, child.card))], cardStyle),
    [
      Option.match(Option.fromNullishOr(child.outline), {
        onNone: () => h.div(styledAttributes([], missingOutlineStyle)),
        onSome: (outline) =>
          PlaceOutline.view(
            {
              geometry: outline.geometry,
              boundingBox: outline.boundingBox,
              label: name,
              ...(page.map === null
                ? {}
                : {
                    surroundings: {
                      geometry: page.map.place.geometry,
                      boundingBox: page.map.place.boundingBox,
                      label: page.map.place.name,
                    },
                  }),
            },
            h,
          ),
      }),
      AppText.view({ element: "span", weight: "medium", styles: [nameStyle], children: [name] }, h),
    ],
  )
}

const countLabel = (count: number): string => (count === 1 ? "1 lugar" : `${count} lugares`)

/**
 * The places inside a place, each a card with its outline. They load a page at a time, since a
 * state can hold hundreds of municipalities. Only shown when the place has some.
 */
export const view = (
  { model, language, page }: Readonly<{ model: Model; language: SupportedLanguage; page: Page }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  if (page.kind !== "PLACE") {
    return []
  }

  const hasNone = Option.exists(
    AsyncData.getData(model.childPlacesAsyncData),
    (loaded) => loaded.totalCount === 0,
  )

  return hasNone
    ? []
    : [
        SectionCard.view(
          {
            title: `Lugares ${inPreposition(page)} ${primaryName(page)}`,
            icon: Icons.mapPoint,
            children: [
              asyncView(
                {
                  asyncData: model.childPlacesAsyncData,
                  loading: { label: "Carregando lugares", shape: "rows" },
                  onData: ({ places, totalCount }) =>
                    h.div(
                      [],
                      [
                        EffectArray.match(places, {
                          onEmpty: () =>
                            EmptyState.view(
                              { icon: Icons.mapPoint, title: "Nenhum lugar por aqui ainda" },
                              h,
                            ),
                          onNonEmpty: (shown) =>
                            h.div(
                              styledAttributes([], gridStyle),
                              shown.map((child) => childCard({ child, language, page }, h)),
                            ),
                        }),
                        ...(places.length < totalCount
                          ? [
                              h.div(styledAttributes([], footerStyle), [
                                AppText.view(
                                  {
                                    element: "p",
                                    appearance: "footnote",
                                    isMuted: true,
                                    children: [
                                      `Mostrando ${places.length} de ${countLabel(totalCount)}`,
                                    ],
                                  },
                                  h,
                                ),
                                AppButton.view(
                                  {
                                    mode: "outline",
                                    onClick: Message.ClickedLoadMoreChildPlaces(),
                                    isDisabled: AsyncData.isRefreshing(model.childPlacesAsyncData),
                                    children: [
                                      AsyncData.isRefreshing(model.childPlacesAsyncData)
                                        ? "Carregando…"
                                        : "Mostrar mais lugares",
                                    ],
                                  },
                                  h,
                                ),
                              ]),
                            ]
                          : []),
                      ],
                    ),
                },
                h,
              ),
            ],
          },
          h,
        ),
      ]
}
