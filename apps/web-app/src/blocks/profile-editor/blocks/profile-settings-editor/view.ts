import {
  InformationVisibility,
  ProfileVisibility,
  SupportedLanguage,
} from "@gororobas/domain/common/enums"
import type { MyAccount } from "@gororobas/domain/people/domain"
import type {
  PersonProfileRow as PersonProfileRowSchema,
  ProfileContentCounts as ProfileContentCountsSchema,
} from "@gororobas/domain/profiles/domain"
import type { MessageDescriptor } from "@lingui/core"
import { msg, plural } from "@lingui/core/macro"
import { Style } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { type LanguageInputs, languageNames } from "../../../../lib/language"
import { type Translator, translatorFor } from "../../../../lib/translations"
import { informationVisibilityLabels } from "../../../../lib/vocabulary"
import { AppButton } from "../../../../ui/app-button"
import { AppText } from "../../../../ui/app-text"
import { ChoiceRow } from "../../../../ui/choice-row"
import * as Icons from "../../../../ui/icons"
import type { IconConfig } from "../../../../ui/icons"
import { OptionCards } from "../../../../ui/option-cards"
import { styledAttributes } from "../../../../ui/pleat-attributes"
import { SectionCard } from "../../../../ui/section-card"
import { borderWidth, radius, space, toneColors, tones } from "../../../../ui/theme"
import {
  ProfileSettingsEditorComposition,
  type ProfileSettingsEditorViewBuilder,
} from "./composition"
import { Message } from "./message"
import {
  AccountDeletion,
  type DeletionBlocker,
  type Model,
  type Setting,
  SettingSave,
} from "./model"

type PersonProfileRow = typeof PersonProfileRowSchema.Type
type ProfileContentCounts = typeof ProfileContentCountsSchema.Type

type ViewBuilder = ProfileSettingsEditorViewBuilder

const settingsStyle = Style.make({ display: "grid", rowGap: space[6] })

const fieldsetStyle = Style.make({
  display: "grid",
  rowGap: space[3],
  margin: 0,
  padding: 0,
  border: "none",
  minInlineSize: 0,
})

const groupHeaderStyle = Style.make({ display: "grid", rowGap: space[1] })

const rowStyle = Style.make({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space[2],
})

const dividerStyle = Style.make({
  paddingBlockStart: space[6],
  borderBlockStart: `${borderWidth.hairline} solid ${toneColors.border}`,
})

const dangerZoneStyle = Style.make({
  display: "grid",
  rowGap: space[3],
  padding: space[4],
  borderRadius: radius.md,
  border: `${borderWidth.hairline} solid ${tones.destructive.shade[300]}`,
})

const countsGroupStyle = Style.make({ display: "grid", rowGap: space[2] })
const countsStyle = Style.make({ margin: 0, paddingInlineStart: space[5] })

// SHARED

const muted = (text: string, h: ViewBuilder) =>
  AppText.view({ element: "p", appearance: "footnote", isMuted: true, children: [text] }, h)

const legendText = (
  { title, description }: Readonly<{ title: string; description: string }>,
  h: ViewBuilder,
) =>
  h.legend(styledAttributes([], groupHeaderStyle), [
    AppText.view({ element: "span", weight: "semibold", children: [title] }, h),
    AppText.view(
      { element: "span", appearance: "footnote", isMuted: true, children: [description] },
      h,
    ),
  ])

/** Where each setting says it saved, right below what changed. */
const saveStatus = (
  { save, setting, i18n }: Readonly<{ save: SettingSave; setting: Setting; i18n: Translator }>,
  h: ViewBuilder,
): Html => {
  const text = SettingSave.match(save, {
    Idle: () => "",
    Saving: (saving) => (saving.setting === setting ? i18n._(msg`Saving…`) : ""),
    Saved: (saved) => (saved.setting === setting ? i18n._(msg`Saved.`) : ""),
    Failed: (failed) =>
      failed.setting === setting ? i18n._(msg`Couldn't save this. Try again in a moment.`) : "",
  })

  return AppText.view(
    {
      element: "p",
      appearance: "caption",
      tone: SettingSave.guards.Failed(save) ? "destructive" : "primary",
      attributes: [h.Role("status"), h.Attribute("aria-live", "polite")],
      children: [text],
    },
    h,
  )
}

// VISIBILITY

const profileVisibilityIcons: Readonly<Record<ProfileVisibility, (config?: IconConfig) => Html>> = {
  PUBLIC: Icons.globe,
  COMMUNITY: Icons.usersGroup,
}

const profileVisibilityDescriptions: Readonly<Record<ProfileVisibility, MessageDescriptor>> = {
  PUBLIC: msg`Anyone, even without an account.`,
  COMMUNITY: msg`Only people in the Gororobas community.`,
}

const bookmarksVisibilityIcons: Readonly<
  Record<InformationVisibility, (config?: IconConfig) => Html>
> = { PUBLIC: Icons.globe, COMMUNITY: Icons.usersGroup, PRIVATE: Icons.lock }

const bookmarksVisibilityDescriptions: Readonly<Record<InformationVisibility, MessageDescriptor>> =
  {
    PUBLIC: msg`Anyone who can see your profile.`,
    COMMUNITY: msg`Only people in the Gororobas community.`,
    PRIVATE: msg`Only you.`,
  }

const visibilitySettings = (
  {
    profile,
    save,
    i18n,
  }: Readonly<{ profile: PersonProfileRow; save: SettingSave; i18n: Translator }>,
  h: ViewBuilder,
): ReadonlyArray<Html> => [
  h.fieldset(styledAttributes([], fieldsetStyle), [
    legendText(
      {
        title: i18n._(msg`Who can see your profile`),
        description: i18n._(msg`Your name, photo, bio and what you publish publicly.`),
      },
      h,
    ),
    OptionCards.view(
      {
        name: "profile-settings-visibility",
        isDisabled: SettingSave.guards.Saving(save),
        options: ProfileVisibility.literals.map((visibility) => ({
          value: visibility,
          label: i18n._(informationVisibilityLabels[visibility]),
          description: i18n._(profileVisibilityDescriptions[visibility]),
          icon: profileVisibilityIcons[visibility],
          isSelected: profile.visibility === visibility,
          onSelect: Message.ChoseProfileVisibility({ visibility }),
        })),
      },
      h,
    ),
    saveStatus({ save, setting: "ProfileVisibility", i18n }, h),
  ]),
  h.fieldset(styledAttributes([], fieldsetStyle), [
    legendText(
      {
        title: i18n._(msg`Who can see what you save`),
        description: i18n._(
          msg`The plants, books and ideas you bookmark, and how you relate to them.`,
        ),
      },
      h,
    ),
    OptionCards.view(
      {
        name: "profile-settings-bookmarks-visibility",
        isDisabled: SettingSave.guards.Saving(save),
        options: InformationVisibility.literals.map((visibility) => ({
          value: visibility,
          label: i18n._(informationVisibilityLabels[visibility]),
          description: i18n._(bookmarksVisibilityDescriptions[visibility]),
          icon: bookmarksVisibilityIcons[visibility],
          isSelected: profile.bookmarksVisibility === visibility,
          onSelect: Message.ChoseBookmarksVisibility({ visibility }),
        })),
      },
      h,
    ),
    saveStatus({ save, setting: "BookmarksVisibility", i18n }, h),
  ]),
]

// LANGUAGE AND ACCOUNT

const languageSetting = (
  { account, save, i18n }: Readonly<{ account: MyAccount; save: SettingSave; i18n: Translator }>,
  h: ViewBuilder,
): Html =>
  h.fieldset(styledAttributes([], fieldsetStyle), [
    legendText(
      {
        title: i18n._(msg`Language`),
        description: i18n._(msg`What Gororobas and its emails speak to you in, on every device.`),
      },
      h,
    ),
    h.div(
      styledAttributes([], rowStyle),
      ChoiceRow.choices(
        {
          options: SupportedLanguage.literals.map((language) => ({
            label: languageNames[language],
            isSelected: account.preferredLanguage === language,
            onClick: Message.ChoseLanguage({ language }),
          })),
        },
        h,
      ),
    ),
    saveStatus({ save, setting: "Language", i18n }, h),
  ])

const accountSetting = (
  { account, i18n }: Readonly<{ account: MyAccount; i18n: Translator }>,
  h: ViewBuilder,
): Html =>
  h.div(styledAttributes([], fieldsetStyle), [
    h.div(styledAttributes([], groupHeaderStyle), [
      AppText.view(
        {
          element: "h3",
          appearance: "regular",
          weight: "semibold",
          children: [i18n._(msg`Account`)],
        },
        h,
      ),
      AppText.view(
        {
          element: "p",
          appearance: "footnote",
          isMuted: true,
          children: [
            i18n._(msg`You sign in with`),
            " ",
            AppText.view({ element: "strong", weight: "semibold", children: [account.email] }, h),
            ". ",
            i18n._(msg`Nobody else sees it.`),
          ],
        },
        h,
      ),
    ]),
    h.div(styledAttributes([], rowStyle), [
      AppButton.view(
        {
          mode: "outline",
          size: "sm",
          onClick: Message.ClickedSignOut(),
          children: [i18n._(msg`Sign out`)],
        },
        h,
      ),
    ]),
  ])

// DELETION

const blockers: Readonly<Record<DeletionBlocker, MessageDescriptor>> = {
  SoleOrganizationManager: msg`You're the only manager of an organization that has other members. Make someone else a manager before deleting your account.`,
  LastAdministrator: msg`You're the last administrator. Make someone else an administrator before deleting your account.`,
  RequestFailed: msg`Couldn't delete your account right now. Try again in a moment.`,
}

const contentCounts = (
  { counts, i18n }: Readonly<{ counts: ProfileContentCounts; i18n: Translator }>,
  h: ViewBuilder,
): Html => {
  const lines = [
    counts.posts > 0
      ? i18n._(msg`${plural(counts.posts, { one: "# post", other: "# posts" })}`)
      : null,
    counts.events > 0
      ? i18n._(msg`${plural(counts.events, { one: "# event", other: "# events" })}`)
      : null,
    counts.publicationComments > 0
      ? i18n._(
          msg`${plural(counts.publicationComments, { one: "# comment", other: "# comments" })}`,
        )
      : null,
    counts.images > 0
      ? i18n._(msg`${plural(counts.images, { one: "# photo", other: "# photos" })}`)
      : null,
    counts.wikiArticleBookmarks > 0
      ? i18n._(
          msg`${plural(counts.wikiArticleBookmarks, { one: "# saved item", other: "# saved items" })}`,
        )
      : null,
  ].filter((line) => line !== null)

  const lead = (text: string) =>
    AppText.view({ element: "p", appearance: "footnote", children: [text] }, h)

  return EffectArray.match(lines, {
    onEmpty: () => lead(i18n._(msg`This permanently deletes your profile.`)),
    onNonEmpty: (nonEmptyLines) =>
      h.div(styledAttributes([], countsGroupStyle), [
        lead(i18n._(msg`This permanently deletes your profile, and with it:`)),
        h.ul(
          styledAttributes([], countsStyle),
          nonEmptyLines.map((line) =>
            h.li(
              [],
              [AppText.view({ element: "span", appearance: "footnote", children: [line] }, h)],
            ),
          ),
        ),
      ]),
  })
}

const cancelButton = (
  { i18n, isDisabled }: Readonly<{ i18n: Translator; isDisabled: boolean }>,
  h: ViewBuilder,
) =>
  AppButton.view(
    {
      mode: "outline",
      size: "sm",
      isDisabled,
      onClick: Message.ClickedCancelDeletion(),
      children: [i18n._(msg`Keep my account`)],
    },
    h,
  )

const deletion = (
  { deletion, i18n }: Readonly<{ deletion: AccountDeletion; i18n: Translator }>,
  h: ViewBuilder,
): Html =>
  h.div(styledAttributes([h.Attribute("aria-live", "polite")], dangerZoneStyle), [
    AppText.view(
      {
        element: "h3",
        appearance: "regular",
        weight: "semibold",
        tone: "destructive",
        children: [i18n._(msg`Delete account`)],
      },
      h,
    ),
    ...AccountDeletion.match(deletion, {
      Idle: () => [
        muted(
          i18n._(
            msg`Deletes your profile and everything you've shared. Your edits to the encyclopedia stay, without your name. We'll show you what goes before anything is deleted.`,
          ),
          h,
        ),
        h.div(styledAttributes([], rowStyle), [
          AppButton.view(
            {
              tone: "destructive",
              mode: "outline",
              size: "sm",
              onClick: Message.ClickedDeleteAccount(),
              children: [i18n._(msg`Delete my account…`)],
            },
            h,
          ),
        ]),
      ],
      Asking: () => [muted(i18n._(msg`Checking what deleting would remove…`), h)],
      ConfirmingOrganizations: ({ organizationCount }) => [
        AppText.view(
          {
            element: "p",
            appearance: "footnote",
            children: [
              i18n._(
                msg`You're the only member of ${plural(organizationCount, { one: "# organization", other: "# organizations" })}. Deleting your account deletes them and what they've shared, too.`,
              ),
            ],
          },
          h,
        ),
        h.div(styledAttributes([], rowStyle), [
          AppButton.view(
            {
              tone: "destructive",
              size: "sm",
              onClick: Message.ConfirmedDeleteOrganizations(),
              children: [i18n._(msg`Delete them too`)],
            },
            h,
          ),
          cancelButton({ i18n, isDisabled: false }, h),
        ]),
      ],
      ConfirmingContent: ({ personalContentCount }) => [
        contentCounts({ counts: personalContentCount, i18n }, h),
        muted(i18n._(msg`This can't be undone.`), h),
        h.div(styledAttributes([], rowStyle), [
          AppButton.view(
            {
              tone: "destructive",
              size: "sm",
              onClick: Message.ConfirmedDeleteAccount(),
              children: [i18n._(msg`Delete my account forever`)],
            },
            h,
          ),
          cancelButton({ i18n, isDisabled: false }, h),
        ]),
      ],
      Deleting: () => [
        muted(i18n._(msg`Deleting your account…`), h),
        h.div(styledAttributes([], rowStyle), [cancelButton({ i18n, isDisabled: true }, h)]),
      ],
      Blocked: ({ blocker }) => [
        AppText.view(
          {
            element: "p",
            appearance: "footnote",
            tone: "destructive",
            attributes: [h.Role("alert")],
            children: [i18n._(blockers[blocker])],
          },
          h,
        ),
        h.div(styledAttributes([], rowStyle), [cancelButton({ i18n, isDisabled: false }, h)]),
      ],
    }),
  ])

export const view = ProfileSettingsEditorComposition.makeView.withInputs<LanguageInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model: Model, { language }, h): Html => {
    const i18n = translatorFor(language)

    const failed = AppText.view(
      {
        element: "p",
        appearance: "footnote",
        tone: "destructive",
        children: [i18n._(msg`Couldn't load your settings. Try again in a moment.`)],
      },
      h,
    )

    const loading = muted(i18n._(msg`Loading your settings…`), h)

    return SectionCard.view(
      {
        title: i18n._(msg`Settings`),
        icon: Icons.lock,
        headingElement: "h2",
        tone: "neutral",
        children: [
          h.div(styledAttributes([], settingsStyle), [
            ...AsyncData.matchData(model.account, {
              onEmpty: () => [loading],
              onFailure: () => [failed],
              onData: (account) => [languageSetting({ account, save: model.save, i18n }, h)],
            }),
            ...AsyncData.matchData(model.profile, {
              onEmpty: () => [],
              onFailure: () => (Option.isSome(AsyncData.getData(model.account)) ? [failed] : []),
              onData: (profile) => visibilitySettings({ profile, save: model.save, i18n }, h),
            }),
            ...EffectArray.fromOption(
              Option.map(AsyncData.getData(model.account), (account) =>
                h.div(styledAttributes([], dividerStyle, settingsStyle), [
                  accountSetting({ account, i18n }, h),
                  deletion({ deletion: model.deletion, i18n }, h),
                ]),
              ),
            ),
          ]),
        ],
      },
      h,
    )
  },
)
