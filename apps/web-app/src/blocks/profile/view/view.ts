import { Style, When } from "@pleat/core"
import { type DateTime, Match, Option } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { type ProfileTab, profileUrl, searchUrl, wikiArticleUrl } from "../../../app/route"
import { imageUrl } from "../../../media-urls"
import { AppText } from "../../../ui/app-text"
import { EmptyState } from "../../../ui/empty-state"
import * as Icons from "../../../ui/icons"
import type { IconConfig } from "../../../ui/icons"
import { LoadingState } from "../../../ui/loading-state"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { profileAvatar } from "../../../ui/profile-avatar/view"
import { focusRingDeclarations } from "../../../ui/styles/focus-ring"
import { pageColumnBleedStyle, pageColumnStyle } from "../../../ui/styles/page-column"
import { TabNavigation } from "../../../ui/tab-navigation"
import { borderWidth, breakpoint, space, toneColors, tones, toneStyle } from "../../../ui/theme"
import { ProfileComposition, type ProfileViewBuilder } from "../composition"
import * as Collections from "./collections"
import * as Home from "./home"
import { type Page } from "./shared"

const headerBandStyle = Style.make({
  backgroundColor: toneColors.backgroundCard,
  borderBlockEnd: `${borderWidth.hairline} solid ${toneColors.border}`,
})

const headerStyle = Style.make({
  display: "grid",
  rowGap: space[4],
  paddingBlockStart: space[5],
}).pipe(Style.when(breakpoint.md, { paddingBlockStart: space[8] }))

const identityStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[4],
  minInlineSize: 0,
})

const identityTextStyle = Style.make({ display: "grid", rowGap: space[1], minInlineSize: 0 })
const nameStyle = Style.make({ color: tones.secondary.emphasis })

const locationStyle = Style.make({
  display: "inline-flex",
  alignItems: "center",
  gap: space[1],
  color: tones.neutral.shade[700],
})

const locationLinkStyle = Style.make({
  color: tones.accent.shade[800],
  textDecorationLine: "underline",
  textDecorationColor: tones.accent.shade[300],
  textUnderlineOffset: "0.2em",
  outline: "none",
}).pipe(
  Style.when(When.hover, { textDecorationColor: tones.accent.shade[700] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const statusStyle = Style.make({ paddingBlock: space[6] })

const tabEntries: ReadonlyArray<readonly [ProfileTab, string, (config?: IconConfig) => Html]> = [
  ["Home", "Início", Icons.home],
  ["Publications", "Publicações", Icons.clipboard],
  ["Photos", "Fotos", Icons.gallery],
  ["Contributions", "Contribuições", Icons.encyclopedia],
  ["Bookmarks", "Salvos", Icons.bookmark],
]

/** Where the profile is, leading to that place's article when it's one. */
const location = (page: Page, h: ProfileViewBuilder): ReadonlyArray<Html> =>
  page.location === null
    ? []
    : [
        AppText.view(
          {
            element: "p",
            appearance: "large",
            styles: [locationStyle],
            children: [
              Icons.mapPoint({ size: "sm" }),
              page.location.placeHandle === null
                ? page.location.text
                : h.a(
                    styledAttributes(
                      [
                        h.Href(
                          wikiArticleUrl({ kind: "PLACE", handle: page.location.placeHandle }),
                        ),
                      ],
                      locationLinkStyle,
                    ),
                    [page.location.text],
                  ),
            ],
          },
          h,
        ),
      ]

const header = (
  { page, tab }: Readonly<{ page: Page; tab: ProfileTab }>,
  h: ProfileViewBuilder,
): Html =>
  h.div(styledAttributes([], headerBandStyle, toneStyle("primary")), [
    h.header(styledAttributes([], pageColumnStyle, headerStyle), [
      h.div(styledAttributes([], identityStyle), [
        profileAvatar(
          {
            name: page.name,
            maybePhotoUrl: Option.map(Option.fromNullishOr(page.photoId), (id) =>
              imageUrl(id, 300),
            ),
            size: "large",
          },
          h,
        ),
        h.div(styledAttributes([], identityTextStyle), [
          AppText.view(
            {
              element: "h1",
              appearance: "xxl",
              weight: "semibold",
              lineHeight: "tight",
              styles: [nameStyle],
              children: [page.name],
            },
            h,
          ),
          ...location(page, h),
        ]),
      ]),
      TabNavigation.view(
        {
          ariaLabel: `Seções do perfil de ${page.name}`,
          styles: [pageColumnBleedStyle],
          items: tabEntries.map(([entry, label, icon]) => ({
            key: entry,
            label,
            href: profileUrl(page.handle, entry),
            isCurrent: entry === tab,
            maybeIcon: icon,
          })),
        },
        h,
      ),
    ]),
  ])

export type ViewInputs = Readonly<{
  tab: ProfileTab
  maybeToday: Option.Option<DateTime.Utc>
}>

export const view = ProfileComposition.makeView.withInputs<ViewInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, { tab, maybeToday }, h): Html =>
    AsyncData.matchData(model.pageAsyncData, {
      onEmpty: () =>
        h.div(styledAttributes([], pageColumnStyle, statusStyle), [
          LoadingState.view({ label: "Carregando perfil", shape: "page", count: 2 }, h),
        ]),
      onFailure: (error) =>
        h.div(styledAttributes([], pageColumnStyle, statusStyle), [
          error.cause === "NotFound"
            ? EmptyState.view(
                {
                  icon: Icons.user,
                  title: "Não encontramos esse perfil",
                  maybeDescription: Option.some(
                    "Ele pode ter mudado de endereço, ou não estar visível para você.",
                  ),
                  maybeAction: Option.some({
                    label: "Buscar pessoas",
                    href: searchUrl({ type: Option.some("people") }),
                  }),
                  size: "roomy",
                },
                h,
              )
            : EmptyState.view(
                {
                  icon: Icons.alertCircle,
                  title: "Não foi possível carregar o perfil agora",
                  maybeDescription: Option.some("Tente recarregar a página em instantes."),
                  size: "roomy",
                },
                h,
              ),
        ]),
      onData: (page) =>
        h.article(
          [],
          [
            header({ page, tab }, h),
            h.div(styledAttributes([], pageColumnStyle), [
              Match.value(tab).pipe(
                Match.withReturnType<Html>(),
                Match.when("Home", () => Home.view({ model, page, maybeToday }, h)),
                Match.when("Publications", () =>
                  Collections.publications({ model, page, maybeToday }, h),
                ),
                Match.when("Photos", () => Collections.photos({ model, page, maybeToday }, h)),
                Match.when("Contributions", () =>
                  Collections.contributions({ model, page, maybeToday }, h),
                ),
                Match.when("Bookmarks", () =>
                  Collections.bookmarks({ model, page, maybeToday }, h),
                ),
                Match.exhaustive,
              ),
            ]),
          ],
        ),
    }),
)
