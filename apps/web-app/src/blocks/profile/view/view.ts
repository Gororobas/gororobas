import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { Style, When } from "@pleat/core"
import { type DateTime, Match, Option } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { type ProfileTab, profileUrl, searchUrl, wikiArticleUrl } from "../../../app/route"
import { peopleScope } from "../../../app/search-query"
import type { LanguageInputs } from "../../../lib/language"
import { translatorFor } from "../../../lib/translations"
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

const tabEntries: ReadonlyArray<
  readonly [ProfileTab, MessageDescriptor, (config?: IconConfig) => Html]
> = [
  ["Home", msg({ message: "Home", context: "profile tab" }), Icons.home],
  ["Publications", msg`Posts`, Icons.clipboard],
  ["Photos", msg`Photos`, Icons.gallery],
  ["Contributions", msg`Contributions`, Icons.encyclopedia],
  ["Bookmarks", msg({ message: "Saved", context: "profile collection" }), Icons.bookmark],
]

/** Where the profile is, leading to that place's article when it's one. */
const location = (
  { page, language }: Readonly<{ page: Page; language: SupportedLanguage }>,
  h: ProfileViewBuilder,
): ReadonlyArray<Html> =>
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
                          wikiArticleUrl(language, {
                            kind: "PLACE",
                            handle: page.location.placeHandle,
                          }),
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
  { language, page, tab }: Readonly<{ language: SupportedLanguage; page: Page; tab: ProfileTab }>,
  h: ProfileViewBuilder,
): Html => {
  const i18n = translatorFor(language)
  const { name } = page

  return h.div(styledAttributes([], headerBandStyle, toneStyle("primary")), [
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
          ...location({ page, language }, h),
        ]),
      ]),
      TabNavigation.view(
        {
          ariaLabel: i18n._(msg`Sections of ${name}'s profile`),
          styles: [pageColumnBleedStyle],
          items: tabEntries.map(([entry, label, icon]) => ({
            key: entry,
            label: i18n._(label),
            href: profileUrl(language, { handle: page.handle, tab: entry }),
            isCurrent: entry === tab,
            maybeIcon: icon,
          })),
        },
        h,
      ),
    ]),
  ])
}

export type ViewInputs = LanguageInputs &
  Readonly<{
    tab: ProfileTab
    maybeToday: Option.Option<DateTime.Utc>
  }>

export const view = ProfileComposition.makeView.withInputs<ViewInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, { language, tab, maybeToday }, h): Html =>
    AsyncData.matchData(model.pageAsyncData, {
      onEmpty: () =>
        h.div(styledAttributes([], pageColumnStyle, statusStyle), [
          LoadingState.view(
            { label: translatorFor(language)._(msg`Loading profile`), shape: "page", count: 2 },
            h,
          ),
        ]),
      onFailure: (error) =>
        h.div(styledAttributes([], pageColumnStyle, statusStyle), [
          error.cause === "NotFound"
            ? EmptyState.view(
                {
                  icon: Icons.user,
                  title: translatorFor(language)._(msg`We couldn't find this profile`),
                  maybeDescription: Option.some(
                    translatorFor(language)._(
                      msg`It may have moved to another address, or not be visible to you.`,
                    ),
                  ),
                  maybeAction: Option.some({
                    label: translatorFor(language)._(msg`Search people`),
                    href: searchUrl(language, { scope: peopleScope() }),
                  }),
                  size: "roomy",
                },
                h,
              )
            : EmptyState.view(
                {
                  icon: Icons.alertCircle,
                  title: translatorFor(language)._(msg`Couldn't load the profile right now`),
                  maybeDescription: Option.some(
                    translatorFor(language)._(msg`Try reloading the page in a moment.`),
                  ),
                  size: "roomy",
                },
                h,
              ),
        ]),
      onData: (page) =>
        h.article(
          [],
          [
            header({ language, page, tab }, h),
            h.div(styledAttributes([], pageColumnStyle), [
              Match.value(tab).pipe(
                Match.withReturnType<Html>(),
                Match.when("Home", () => Home.view({ model, language, page, maybeToday }, h)),
                Match.when("Publications", () =>
                  Collections.publications({ model, language, page, maybeToday }, h),
                ),
                Match.when("Photos", () =>
                  Collections.photos({ model, language, page, maybeToday }, h),
                ),
                Match.when("Contributions", () =>
                  Collections.contributions({ model, language, page, maybeToday }, h),
                ),
                Match.when("Bookmarks", () =>
                  Collections.bookmarks({ model, language, page, maybeToday }, h),
                ),
                Match.exhaustive,
              ),
            ]),
          ],
        ),
    }),
)
