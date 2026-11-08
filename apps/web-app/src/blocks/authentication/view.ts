import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { Style } from "@pleat/core"
import { Option } from "effect"
import type { Attribute, Html } from "foldkit/html"

import { profileEditorUrl } from "../../app/route"
import type { LanguageInputs } from "../../lib/language"
import { type Translator, translatorFor } from "../../lib/translations"
import { AppButton } from "../../ui/app-button"
import { AppCard } from "../../ui/app-card"
import { AppField } from "../../ui/app-field"
import { AppInput } from "../../ui/app-input"
import { AppText } from "../../ui/app-text"
import * as Icons from "../../ui/icons"
import type { IconConfig } from "../../ui/icons"
import { styledAttributes } from "../../ui/pleat-attributes"
import {
  borderWidth,
  breakpoint,
  fontSize,
  measure,
  radius,
  space,
  toneColors,
  tones,
} from "../../ui/theme"
import { CODE_FIELD_ID, EMAIL_FIELD_ID, NAME_FIELD_ID } from "./command"
import { AuthenticationComposition, type AuthenticationViewBuilder } from "./composition"
import { Message } from "./message"
import { type AuthenticationNotice, CODE_LENGTH, Stage } from "./model"

// LAYOUT

/** The form and why to have an account side by side on wide screens; stacked on phones. */
const pageStyle = Style.make({
  display: "grid",
  gap: space[6],
  alignItems: "start",
  marginInline: "auto",
  inlineSize: "100%",
  maxInlineSize: measure.form,
  paddingBlock: space[8],
  paddingInline: space[4],
}).pipe(
  Style.when(breakpoint.lg, {
    maxInlineSize: measure.page,
    gridTemplateColumns: `minmax(0, ${measure.form}) minmax(0, 22rem)`,
    justifyContent: "center",
    columnGap: space[10],
  }),
)

/** Steps without the aside keep the form's width, centered. */
const singleColumnStyle = Style.make({}).pipe(
  Style.when(breakpoint.lg, { gridTemplateColumns: `minmax(0, ${measure.form})` }),
)

const panelStyle = Style.make({ display: "grid", rowGap: space[5] })
const introStyle = Style.make({ display: "grid", rowGap: space[2] })
const formStyle = Style.make({ display: "grid", rowGap: space[4] })
const actionsStyle = Style.make({ display: "flex", flexWrap: "wrap", gap: space[2] })

const heading = (text: string, h: AuthenticationViewBuilder) =>
  AppText.view(
    { element: "h1", appearance: "xl", weight: "semibold", tone: "secondary", children: [text] },
    h,
  )

const intro = (
  { title, children }: Readonly<{ title: string; children: ReadonlyArray<Html | string> }>,
  h: AuthenticationViewBuilder,
) =>
  h.div(styledAttributes([], introStyle), [
    heading(title, h),
    AppText.view({ element: "p", isMuted: true, children }, h),
  ])

const status = (text: string | null, h: AuthenticationViewBuilder): ReadonlyArray<Html> =>
  text === null
    ? []
    : [
        AppText.view(
          {
            element: "p",
            appearance: "footnote",
            attributes: [h.Role("status"), h.Attribute("aria-live", "polite")],
            children: [text],
          },
          h,
        ),
      ]

const textField = (
  config: Readonly<{
    id: string
    label: string
    value: string
    attributes: ReadonlyArray<Attribute<typeof Message.Type>>
    onInput: (value: string) => typeof Message.Type
    error: string | null
    description?: string
    styles?: ReadonlyArray<Style.Style>
  }>,
  h: AuthenticationViewBuilder,
) =>
  AppField.view(
    {
      label: config.label,
      labelAttributes: [h.For(config.id)],
      error: Option.fromNullishOr(config.error),
      ...(config.description === undefined ? {} : { description: config.description }),
      control: AppInput.view(
        {
          attributes: [
            h.Id(config.id),
            h.Value(config.value),
            h.Required(true),
            h.OnInput(config.onInput),
            ...config.attributes,
          ],
          ...(config.styles === undefined ? {} : { styles: config.styles }),
        },
        h,
      ),
    },
    h,
  )

// CODE

/** Six wide, evenly spaced digits, so the code reads like the one in the email. */
const codeInputStyle = Style.make({
  minBlockSize: "3.5rem",
  fontSize: fontSize.xl,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.6em",
  textAlign: "center",
  // The last digit's spacing would push the code off center.
  textIndent: "0.6em",
})

const notices: Readonly<Record<AuthenticationNotice, MessageDescriptor>> = {
  LinkFailed: msg`This link didn't work. It may have expired or been opened in another browser. Enter your email to get a new one.`,
  SendFailed: msg`We couldn't send the email. Check the address and try again.`,
  CodeResent: msg`We sent a new email. Earlier codes no longer work.`,
  CodeFailed: msg`This code didn't work. Check it, or resend the email to get another one.`,
  SomethingWentWrong: msg`Something went wrong. Try again.`,
}

// WHY AN ACCOUNT

const asideStyle = Style.make({
  display: "grid",
  rowGap: space[4],
  padding: space[5],
  borderRadius: radius.lg,
  border: `${borderWidth.hairline} solid ${toneColors.border}`,
}).pipe(Style.when(breakpoint.lg, { marginBlockStart: space[2] }))

const benefitListStyle = Style.make({
  display: "grid",
  rowGap: space[3],
  margin: 0,
  padding: 0,
  listStyle: "none",
})

const benefitStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  columnGap: space[3],
  alignItems: "start",
})

const privacyStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  columnGap: space[3],
  alignItems: "start",
  paddingBlockStart: space[4],
  borderBlockStart: `${borderWidth.hairline} solid ${toneColors.border}`,
  color: tones.neutral.shade[700],
})

const benefits: ReadonlyArray<
  Readonly<{ icon: (config?: IconConfig) => Html; text: MessageDescriptor }>
> = [
  { icon: Icons.bookmark, text: msg`Save plants, books and ideas to come back to` },
  { icon: Icons.route, text: msg`Share where you grow, and see who grows nearby` },
  { icon: Icons.pen, text: msg`Improve the encyclopedia with what you know` },
  { icon: Icons.message, text: msg`Publish and talk with people who practice agroecology` },
]

const whyAnAccount = (i18n: Translator, h: AuthenticationViewBuilder): Html =>
  h.aside(styledAttributes([h.AriaLabel(i18n._(msg`Why create an account`))], asideStyle), [
    AppText.view(
      {
        element: "h2",
        appearance: "regular",
        weight: "semibold",
        children: [i18n._(msg`With an account, you can`)],
      },
      h,
    ),
    h.ul(
      styledAttributes([], benefitListStyle),
      benefits.map(({ icon, text }) =>
        h.li(styledAttributes([], benefitStyle), [
          icon({ size: "md", tone: "primary" }),
          AppText.view({ element: "span", appearance: "footnote", children: [i18n._(text)] }, h),
        ]),
      ),
    ),
    h.div(styledAttributes([], privacyStyle), [
      Icons.lock({ size: "sm" }),
      AppText.view(
        {
          element: "p",
          appearance: "caption",
          lineHeight: "relaxed",
          children: [
            i18n._(
              msg`No passwords. Your email is only used to sign you in and to send you what you ask for. It never shows on your profile, and we never share or sell it.`,
            ),
          ],
        },
        h,
      ),
    ]),
  ])

// STAGES

const enteringEmail = (
  {
    email,
    isSending,
    error,
    i18n,
  }: Readonly<{ email: string; isSending: boolean; error: string | null; i18n: Translator }>,
  h: AuthenticationViewBuilder,
): ReadonlyArray<Html> => [
  intro(
    {
      title: i18n._(msg`Sign in or create your account`),
      children: [i18n._(msg`No password needed: we'll email you a code to sign in.`)],
    },
    h,
  ),
  h.form(styledAttributes([h.OnSubmit(Message.SubmittedEmail())], formStyle), [
    textField(
      {
        id: EMAIL_FIELD_ID,
        label: i18n._(msg`Email`),
        value: email,
        attributes: [
          h.Type("email"),
          h.Name("email"),
          h.Attribute("maxlength", "320"),
          h.Attribute("autocomplete", "email"),
          h.Attribute("placeholder", i18n._(msg`you@example.com`)),
          h.Autofocus(true),
        ],
        onInput: (value) => Message.UpdatedEmail({ value }),
        error,
      },
      h,
    ),
    AppButton.view(
      {
        type: "submit",
        tone: "primary",
        isDisabled: isSending,
        children: [isSending ? i18n._(msg`Sending…`) : i18n._(msg`Continue with email`)],
      },
      h,
    ),
  ]),
]

const awaitingCode = (
  {
    stage,
    i18n,
    notice,
  }: Readonly<{
    stage: typeof Stage.AwaitingCode.Type
    i18n: Translator
    notice: string | null
  }>,
  h: AuthenticationViewBuilder,
): ReadonlyArray<Html> => {
  const { pending, code, isBusy, canResend } = stage

  return [
    intro(
      {
        title: i18n._(msg`Check your email`),
        children: [
          i18n._(msg`We sent a code to`),
          " ",
          AppText.view({ element: "strong", weight: "semibold", children: [pending.email] }, h),
          ". ",
          i18n._(msg`Type it below, or open the link in the email on this device.`),
        ],
      },
      h,
    ),
    h.form(styledAttributes([h.OnSubmit(Message.SubmittedCode())], formStyle), [
      textField(
        {
          id: CODE_FIELD_ID,
          label: i18n._(msg`Code`),
          value: code,
          attributes: [
            h.Type("text"),
            h.Name("code"),
            h.Attribute("inputmode", "numeric"),
            h.Attribute("autocomplete", "one-time-code"),
            h.Attribute("pattern", `[0-9]{${CODE_LENGTH}}`),
            h.Attribute("maxlength", `${CODE_LENGTH}`),
            h.Attribute("placeholder", "000000"),
            h.Attribute("aria-busy", isBusy ? "true" : "false"),
            h.Autofocus(true),
          ],
          onInput: (value) => Message.UpdatedCode({ value }),
          error: null,
          description: i18n._(
            msg`The code expires in 5 minutes. Can't find the email? Check your spam folder.`,
          ),
          styles: [codeInputStyle],
        },
        h,
      ),
      AppButton.view(
        {
          type: "submit",
          tone: "primary",
          isDisabled: isBusy || code.length !== CODE_LENGTH,
          children: [isBusy ? i18n._(msg`Verifying…`) : i18n._(msg`Sign in`)],
        },
        h,
      ),
    ]),
    ...status(notice, h),
    h.div(styledAttributes([], actionsStyle), [
      AppButton.view(
        {
          mode: "outline",
          size: "sm",
          isDisabled: isBusy || !canResend,
          onClick: Message.ClickedResend(),
          children: [
            canResend ? i18n._(msg`Resend email`) : i18n._(msg`Resend email in a few seconds`),
          ],
        },
        h,
      ),
      AppButton.view(
        {
          mode: "outline",
          size: "sm",
          isDisabled: isBusy,
          onClick: Message.ClickedUseDifferentEmail(),
          children: [i18n._(msg`Use another email`)],
        },
        h,
      ),
    ]),
  ]
}

const onboarding = (
  {
    name,
    isSaving,
    error,
    i18n,
  }: Readonly<{ name: string; isSaving: boolean; error: string | null; i18n: Translator }>,
  h: AuthenticationViewBuilder,
): ReadonlyArray<Html> => [
  intro(
    {
      title: i18n._(msg`Welcome to Gororobas!`),
      children: [
        i18n._(
          msg`Your account is ready. Tell us what to call you: it's the name people see on your profile and contributions. A photo, a bio and your places come next.`,
        ),
      ],
    },
    h,
  ),
  h.form(styledAttributes([h.OnSubmit(Message.SubmittedName())], formStyle), [
    textField(
      {
        id: NAME_FIELD_ID,
        label: i18n._(msg`Your name`),
        value: name,
        attributes: [
          h.Type("text"),
          h.Name("name"),
          h.Attribute("maxlength", "128"),
          h.Attribute("autocomplete", "name"),
          h.Autofocus(true),
        ],
        onInput: (value) => Message.UpdatedName({ value }),
        error,
      },
      h,
    ),
    AppButton.view(
      {
        type: "submit",
        tone: "primary",
        isDisabled: isSaving || name.trim() === "",
        children: [isSaving ? i18n._(msg`Saving…`) : i18n._(msg`Continue`)],
      },
      h,
    ),
  ]),
]

const signedIn = (
  {
    stage,
    i18n,
    language,
  }: Readonly<{
    stage: typeof Stage.SignedIn.Type
    i18n: Translator
    language: LanguageInputs["language"]
  }>,
  h: AuthenticationViewBuilder,
): ReadonlyArray<Html> => {
  const { name, isSigningOut, connection } = stage

  return [
    intro({ title: i18n._(msg`Hi, ${name}`), children: [i18n._(msg`You're signed in.`)] }, h),
    ...status(
      connection === "Offline"
        ? i18n._(
            msg`You're offline or the server is unavailable. Your account stays available on this device; online actions wait for the session to be verified.`,
          )
        : connection === "Checking"
          ? i18n._(msg`Checking your session before online actions…`)
          : null,
      h,
    ),
    h.div(styledAttributes([], actionsStyle), [
      AppButton.view(
        {
          tone: "primary",
          href: profileEditorUrl(language),
          children: [i18n._(msg`Edit your profile`)],
        },
        h,
      ),
      AppButton.view(
        {
          mode: "outline",
          isDisabled: isSigningOut,
          onClick: Message.ClickedSignOut(),
          children: [i18n._(msg`Sign out`)],
        },
        h,
      ),
    ]),
  ]
}

const panel = (children: ReadonlyArray<Html>, h: AuthenticationViewBuilder) =>
  AppCard.view({ kind: "panel", styles: [panelStyle], children }, h)

export const view = AuthenticationComposition.makeView.withInputs<LanguageInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, { language }, h): Html => {
    const i18n = translatorFor(language)
    const noticeText = (nullableNotice: AuthenticationNotice | null) =>
      nullableNotice === null ? null : i18n._(notices[nullableNotice])

    const hasAside =
      Stage.guards.EnteringEmail(model.stage) || Stage.guards.AwaitingCode(model.stage)

    return h.div(
      styledAttributes([], pageStyle, ...(hasAside ? [] : [singleColumnStyle])),
      Stage.match(model.stage, {
        Restoring: () => [
          AppText.view(
            {
              element: "p",
              attributes: [h.Role("status")],
              children: [i18n._(msg`Checking your session…`)],
            },
            h,
          ),
        ],
        EnteringEmail: ({ email, isSending, error }) => [
          panel(enteringEmail({ email, isSending, error: noticeText(error), i18n }, h), h),
          whyAnAccount(i18n, h),
        ],
        AwaitingCode: (stage) => [
          panel(awaitingCode({ stage, i18n, notice: noticeText(stage.notice) }, h), h),
          whyAnAccount(i18n, h),
        ],
        Onboarding: ({ name, isSaving, error }) => [
          panel(onboarding({ name, isSaving, error: noticeText(error), i18n }, h), h),
        ],
        SignedIn: (stage) => [panel(signedIn({ stage, i18n, language }, h), h)],
      }),
    )
  },
)
