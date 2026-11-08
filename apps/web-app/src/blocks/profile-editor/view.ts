import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { Style } from "@pleat/core"
import { Match } from "effect"
import type { Html } from "foldkit/html"

import { loginUrl, profileEditorUrl, ProfileEditorSection } from "../../app/route"
import type { LanguageInputs } from "../../lib/language"
import { type Translator, translatorFor } from "../../lib/translations"
import { AppButton } from "../../ui/app-button"
import { AppText } from "../../ui/app-text"
import * as Icons from "../../ui/icons"
import type { IconConfig } from "../../ui/icons"
import { styledAttributes } from "../../ui/pleat-attributes"
import { SectionCard } from "../../ui/section-card"
import { TabNavigation } from "../../ui/tab-navigation"
import { measure, space } from "../../ui/theme"
import {
  AboutBinding,
  LocationsBinding,
  ProfileEditorComposition,
  type ProfileEditorViewBuilder,
  SettingsBinding,
} from "./composition"
import type { Model } from "./model"

/** Whether the app knows yet who's reading, which decides between the editor and signing in. */
export type SessionPhase = "Restoring" | "SignedOut" | "SignedIn"

export type ViewInputs = LanguageInputs &
  Readonly<{ section: ProfileEditorSection; sessionPhase: SessionPhase }>

const pageStyle = Style.make({
  display: "grid",
  rowGap: space[5],
  marginInline: "auto",
  inlineSize: "100%",
  maxInlineSize: measure.prose,
  paddingBlock: space[6],
  paddingInline: space[4],
})

const headerStyle = Style.make({ display: "grid", rowGap: space[3] })
const promptStyle = Style.make({ display: "grid", rowGap: space[3], justifyItems: "start" })

const sectionLabels: Readonly<Record<ProfileEditorSection, MessageDescriptor>> = {
  About: msg`About me`,
  Places: msg`Places`,
  Settings: msg`Settings`,
}

const sectionIcons: Readonly<Record<ProfileEditorSection, (config?: IconConfig) => Html>> = {
  About: Icons.user,
  Places: Icons.route,
  Settings: Icons.lock,
}

const sections = (
  {
    language,
    section,
    i18n,
  }: Readonly<{ language: SupportedLanguage; section: ProfileEditorSection; i18n: Translator }>,
  h: ProfileEditorViewBuilder,
) =>
  TabNavigation.view(
    {
      ariaLabel: i18n._(msg`Sections of your account`),
      items: ProfileEditorSection.literals.map((item) => ({
        key: item,
        label: i18n._(sectionLabels[item]),
        maybeIcon: sectionIcons[item],
        href: profileEditorUrl(language, item),
        isCurrent: item === section,
      })),
    },
    h,
  )

const signInPrompt = (
  { language, i18n }: Readonly<{ language: SupportedLanguage; i18n: Translator }>,
  h: ProfileEditorViewBuilder,
) =>
  SectionCard.view(
    {
      title: i18n._(msg`Your account`),
      icon: Icons.user,
      headingElement: "h1",
      tone: "neutral",
      children: [
        h.div(styledAttributes([], promptStyle), [
          AppText.view(
            {
              element: "p",
              children: [
                i18n._(
                  msg`Sign in to edit your profile, record your places and choose your settings.`,
                ),
              ],
            },
            h,
          ),
          AppButton.view(
            { tone: "primary", href: loginUrl(language), children: [i18n._(msg`Sign in`)] },
            h,
          ),
        ]),
      ],
    },
    h,
  )

const sectionView = (
  {
    model,
    section,
    language,
  }: Readonly<{ model: Model; section: ProfileEditorSection; language: SupportedLanguage }>,
  h: ProfileEditorViewBuilder,
): Html =>
  Match.value(section).pipe(
    Match.withReturnType<Html>(),
    Match.when("About", () =>
      h.block(
        AboutBinding.embedView({
          slotId: "profile-about-editor",
          model: model.about,
          viewInputs: { language },
        }),
      ),
    ),
    Match.when("Places", () =>
      h.block(
        LocationsBinding.embedView({
          slotId: "profile-locations-editor",
          model: model.locations,
          viewInputs: { language },
        }),
      ),
    ),
    Match.when("Settings", () =>
      h.block(
        SettingsBinding.embedView({
          slotId: "profile-settings-editor",
          model: model.settings,
          viewInputs: { language },
        }),
      ),
    ),
    Match.exhaustive,
  )

export const view = ProfileEditorComposition.makeView.withInputs<ViewInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, { language, section, sessionPhase }, h): Html => {
    const i18n = translatorFor(language)

    if (sessionPhase === "Restoring") {
      return h.div(styledAttributes([], pageStyle), [
        AppText.view(
          {
            element: "p",
            attributes: [h.Role("status")],
            children: [i18n._(msg`Checking your session…`)],
          },
          h,
        ),
      ])
    } else if (sessionPhase === "SignedOut") {
      return h.div(styledAttributes([], pageStyle), [signInPrompt({ language, i18n }, h)])
    } else {
      return h.div(styledAttributes([], pageStyle), [
        h.header(styledAttributes([], headerStyle), [
          AppText.view(
            {
              element: "h1",
              appearance: "xl",
              weight: "semibold",
              tone: "secondary",
              children: [i18n._(msg`Your account`)],
            },
            h,
          ),
          sections({ language, section, i18n }, h),
        ]),
        sectionView({ model, section, language }, h),
      ])
    }
  },
)
