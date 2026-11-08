import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { msg } from "@lingui/core/macro"
import { Style } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import type { Document, Html } from "foldkit/html"

import { isRestoringSession, isSignedIn, viewerName } from "../blocks/authentication"
import { intlTags, languageNames } from "../lib/language"
import { type Translator, translatorFor } from "../lib/translations"
import * as AppShell from "../ui/app-shell"
import { AppText } from "../ui/app-text"
import * as Icons from "../ui/icons"
import { styledAttributes, styledClassName } from "../ui/pleat-attributes"
import { profileAvatar } from "../ui/profile-avatar/view"
import { measure, space, toneColors, toneStyle } from "../ui/theme"
import {
  ApplicationComposition,
  type ApplicationViewBuilder,
  AuthenticationBinding,
  ExternalDataAdminDashboardBinding,
  ProfileBinding,
  ProfileEditorBinding,
  SearchBinding,
  SettingsMenuBinding,
  WikiArticleBinding,
  WikiArticleDebugBinding,
  profileKey,
  wikiArticleKey,
} from "./composition"
import { Message } from "./message"
import type { Model } from "./model"
import {
  ApplicationRoute,
  applicationRouteUrl,
  loginUrl,
  profileEditorUrl,
  searchUrl,
} from "./route"
import {
  type SearchType,
  peopleScope,
  publicationsScope,
  scopeType,
  wikiScope,
} from "./search-query"

// SHARED STYLES

// The document scrolls, so the app bar leaves with the content and pages can pin their own headers.
// `clip` keeps a stray wide element from scrolling the whole page sideways on phones, and,
// unlike `hidden`, doesn't create a scroll container, so sticky headers keep working.
const shellStyle = Style.make({
  display: "flex",
  minBlockSize: "100dvh",
  flexDirection: "column",
  overflowX: "clip",
})

const mainStyle = Style.make({ display: "flex", flex: 1, flexDirection: "column" })

/** Search and articles lay out their own wide columns; other pages read as one column. */
const proseStyle = Style.make({
  inlineSize: "100%",
  maxInlineSize: measure.prose,
  marginInline: "auto",
})

const notFoundStyle = Style.make({ display: "grid", rowGap: space[3], padding: space[6] })

// NAVIGATION

const isSearchType = (route: ApplicationRoute, type: SearchType) =>
  ApplicationRoute.guards.Search(route) && Option.contains(scopeType(route.query.scope), type)

const navigationItems = (
  model: typeof Model.Type,
  i18n: Translator,
): ReadonlyArray<AppShell.NavigationItem> => [
  {
    label: i18n._(msg`Encyclopedia`),
    href: searchUrl(model.language, { scope: wikiScope() }),
    icon: Icons.encyclopedia,
    isCurrent:
      isSearchType(model.route, "wiki") || ApplicationRoute.guards.WikiArticle(model.route),
  },
  {
    label: i18n._(msg`Publications`),
    href: searchUrl(model.language, { scope: publicationsScope() }),
    icon: Icons.clipboard,
    isCurrent: isSearchType(model.route, "publications"),
  },
  {
    label: i18n._(msg`People`),
    href: searchUrl(model.language, { scope: peopleScope() }),
    icon: Icons.users,
    isCurrent: isSearchType(model.route, "people") || ApplicationRoute.guards.Profile(model.route),
  },
]

/** The current page in every language, so switching keeps people where they are. */
const languageLinks = (model: typeof Model.Type): ReadonlyArray<AppShell.LanguageLink> =>
  SupportedLanguage.literals.map((language) => ({
    name: languageNames[language],
    href: applicationRouteUrl(language, model.route),
    hreflang: intlTags[language],
    isCurrent: language === model.language,
  }))

/**
 * One menu for settings: visitors open it from a globe, beside signing in; people signed in from
 * their avatar, with their account first.
 */
const settingsMenu = (
  { model, i18n }: Readonly<{ model: typeof Model.Type; i18n: Translator }>,
  h: ApplicationViewBuilder,
): ReadonlyArray<Html> => {
  const maybeName = viewerName(model.authentication)
  const languagesLabel = i18n._(msg`Language`)
  const currentLanguage = languageNames[model.language]

  return [
    h.block(
      SettingsMenuBinding.embedView({
        slotId: model.settingsMenu.id,
        model: model.settingsMenu,
        viewInputs: {
          title: Option.getOrElse(maybeName, () => languagesLabel),
          trigger: Option.match(maybeName, {
            onNone: () => ({
              children: [Icons.globe({ size: "md" })],
              className: styledClassName(AppShell.globeTriggerStyle),
              ariaLabel: i18n._(msg`Language: ${currentLanguage}`),
            }),
            onSome: (name) => ({
              children: [profileAvatar({ name, maybePhotoUrl: Option.none(), size: "compact" }, h)],
              className: styledClassName(AppShell.avatarTriggerStyle),
              ariaLabel: i18n._(msg`${name}'s menu`),
            }),
          }),
          toContent: () =>
            AppShell.menuContent(
              {
                maybeAccount: Option.map(maybeName, () => ({
                  label: i18n._(msg`Your account`),
                  href: profileEditorUrl(model.language),
                })),
                languagesLabel,
                languages: languageLinks(model),
              },
              h,
            ),
          anchor: { placement: "bottom-end", gap: 6, padding: 8 },
          panelClassName: styledClassName(AppShell.menuPanelStyle),
        },
      }),
    ),
    ...(Option.isNone(maybeName)
      ? [AppShell.signInButton({ label: i18n._(msg`Sign in`), href: loginUrl(model.language) }, h)]
      : []),
  ]
}

/** Search takes over the app bar: no navigation, settings or account compete with the field. */
const header = (
  { model, i18n, search }: Readonly<{ model: typeof Model.Type; i18n: Translator; search: Html }>,
  h: ApplicationViewBuilder,
): Html => {
  const isSearching = ApplicationRoute.guards.Search(model.route)

  return AppShell.header(
    {
      homeHref: searchUrl(model.language),
      homeLabel: i18n._(msg`Gororobas: home`),
      navigationLabel: i18n._(msg`Main navigation`),
      search,
      navigation: isSearching ? [] : navigationItems(model, i18n),
      trailing: isSearching ? [] : settingsMenu({ model, i18n }, h),
    },
    h,
  )
}

const noticeStyle = Style.make({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  columnGap: space[3],
  rowGap: space[1],
  paddingBlock: space[2],
  paddingInline: space[4],
  backgroundColor: toneColors.backgroundMuted,
})

/** Says which language failed to load, and retries it through its link. */
const languageNotice = (
  { model, i18n }: Readonly<{ model: typeof Model.Type; i18n: Translator }>,
  h: ApplicationViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.map(model.maybeUnavailableLanguage, (unavailable) => {
      const unavailableName = languageNames[unavailable]
      const currentName = languageNames[model.language]

      return h.div(styledAttributes([h.Role("alert")], toneStyle("secondary"), noticeStyle), [
        AppText.view(
          {
            element: "p",
            appearance: "footnote",
            children: [
              i18n._(
                msg`${unavailableName} couldn't load, so Gororobas is in ${currentName} for now.`,
              ),
            ],
          },
          h,
        ),
        h.a([h.Href(applicationRouteUrl(unavailable, model.route))], [i18n._(msg`Try again`)]),
      ])
    }),
  )

const notFound = (
  { path, i18n }: Readonly<{ path: string; i18n: Translator }>,
  h: ApplicationViewBuilder,
): Html =>
  h.section(styledAttributes([], notFoundStyle), [
    AppText.view(
      {
        element: "h1",
        appearance: "xl",
        weight: "semibold",
        children: [i18n._(msg`Page not found`)],
      },
      h,
    ),
    AppText.view(
      { element: "p", isMuted: true, children: [i18n._(msg`There is nothing at ${path}.`)] },
      h,
    ),
  ])

const prose = (content: Html, h: ApplicationViewBuilder): Html =>
  h.div(styledAttributes([], proseStyle), [content])

const page = (
  { model, i18n }: Readonly<{ model: typeof Model.Type; i18n: Translator }>,
  h: ApplicationViewBuilder,
): Html => {
  const language = model.language

  return ApplicationRoute.match(model.route, {
    Search: ({ query }) =>
      h.block(
        SearchBinding.embedView({
          slotId: "search",
          model: model.search,
          viewInputs: {
            language,
            query,
            maybeToday: model.maybeToday,
            renderHeader: (search) => header({ model, i18n, search }, h),
          },
        }),
      ),
    WikiArticle: (route) =>
      Option.match(model.maybeWikiArticle, {
        onNone: () => h.empty,
        onSome: (article) =>
          article.articleKey === wikiArticleKey(language, route)
            ? h.block(
                WikiArticleBinding.embedView({
                  key: article.articleKey,
                  slotId: "wiki-article",
                  model: article.model,
                  viewInputs: {
                    language,
                    tab: route.tab,
                    isSignedIn: isSignedIn(model.authentication),
                    maybeToday: model.maybeToday,
                  },
                }),
              )
            : h.empty,
      }),
    Profile: (route) =>
      Option.match(model.maybeProfile, {
        onNone: () => h.empty,
        onSome: (profile) =>
          profile.profileKey === profileKey(language, route.handle)
            ? h.block(
                ProfileBinding.embedView({
                  key: profile.profileKey,
                  slotId: "profile",
                  model: profile.model,
                  viewInputs: { language, tab: route.tab, maybeToday: model.maybeToday },
                }),
              )
            : h.empty,
      }),
    WikiArticleDebug: ({ wikiArticleId }) =>
      prose(
        Option.match(model.maybeWikiArticleDebug, {
          onNone: () => h.empty,
          onSome: (debug) =>
            debug.wikiArticleId === wikiArticleId
              ? h.block(
                  WikiArticleDebugBinding.embedView({
                    key: wikiArticleId,
                    slotId: "wiki-article-debug",
                    model: debug.model,
                    viewInputs: { language },
                  }),
                )
              : h.empty,
        }),
        h,
      ),
    Login: () =>
      h.block(
        AuthenticationBinding.embedView({
          slotId: "authentication",
          model: model.authentication,
          viewInputs: { language },
        }),
      ),
    ProfileEditor: ({ section }) =>
      Option.match(model.maybeProfileEditor, {
        onNone: () => h.empty,
        onSome: (editor) =>
          h.block(
            ProfileEditorBinding.embedView({
              slotId: "profile-editor",
              model: editor,
              viewInputs: {
                language,
                section,
                sessionPhase: isRestoringSession(model.authentication)
                  ? "Restoring"
                  : isSignedIn(model.authentication)
                    ? "SignedIn"
                    : "SignedOut",
              },
            }),
          ),
      }),
    ExternalDataAdminDashboard: () =>
      Option.match(model.maybeExternalDataAdminDashboard, {
        onNone: () => h.empty,
        onSome: (log) =>
          h.block(
            ExternalDataAdminDashboardBinding.embedView({
              key: log.queryKey,
              slotId: "external-data-admin-dashboard",
              model: log.model,
              viewInputs: { language },
            }),
          ),
      }),
    NotFound: ({ path }) => prose(notFound({ path, i18n }, h), h),
  })
}

const title = (route: ApplicationRoute, i18n: Translator): string =>
  ApplicationRoute.match(route, {
    Search: () => i18n._(msg`Search | Gororobas`),
    WikiArticle: () => i18n._(msg`Encyclopedia | Gororobas`),
    WikiArticleDebug: () => i18n._(msg`Debugging | Gororobas`),
    Profile: () => i18n._(msg`People | Gororobas`),
    Login: () => i18n._(msg`Sign in | Gororobas`),
    ProfileEditor: () => i18n._(msg`Your account | Gororobas`),
    ExternalDataAdminDashboard: () => i18n._(msg`External data | Gororobas`),
    NotFound: () => i18n._(msg`Page not found | Gororobas`),
  })

export const view = ApplicationComposition.makeView((model, h): Document => {
  const i18n = translatorFor(model.language)
  const isSearching = ApplicationRoute.guards.Search(model.route)

  return {
    title: title(model.route, i18n),
    lang: intlTags[model.language],
    body: h.div(styledAttributes([], shellStyle), [
      ...(isSearching
        ? []
        : [
            header(
              {
                model,
                i18n,
                search: AppShell.searchLink(
                  {
                    href: searchUrl(model.language),
                    onClick: Message.ClickedSearchLink(),
                    label: i18n._(msg`Search`),
                    ariaLabel: i18n._(msg`Open search`),
                  },
                  h,
                ),
              },
              h,
            ),
          ]),
      ...languageNotice({ model, i18n }, h),
      h.main(styledAttributes([], mainStyle), [page({ model, i18n }, h)]),
      ...(isSearching
        ? []
        : [
            AppShell.bottomNavigation(
              { label: i18n._(msg`Main navigation`), items: navigationItems(model, i18n) },
              h,
            ),
          ]),
    ]),
  }
})
