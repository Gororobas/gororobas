import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { Style } from "@pleat/core"
import { Option } from "effect"
import type { Attribute, Html } from "foldkit/html"

import { myPlacesUrl } from "../../app/route"
import type { LanguageInputs } from "../../lib/language"
import { translatorFor } from "../../lib/translations"
import { AppButton } from "../../ui/app-button"
import { AppCard } from "../../ui/app-card"
import { AppField } from "../../ui/app-field"
import { AppInput } from "../../ui/app-input"
import { AppText } from "../../ui/app-text"
import { styledAttributes } from "../../ui/pleat-attributes"
import { measure, space } from "../../ui/theme"
import { AuthenticationComposition, type AuthenticationViewBuilder } from "./composition"
import { Message } from "./message"
import { type AuthenticationNotice, Stage } from "./model"

const pageStyle = Style.make({
  display: "grid",
  rowGap: space[5],
  marginInline: "auto",
  inlineSize: "100%",
  maxInlineSize: measure.narrow,
  paddingBlock: space[8],
  paddingInline: space[4],
})

const formStyle = Style.make({ display: "grid", rowGap: space[4] })
const actionsStyle = Style.make({ display: "flex", flexWrap: "wrap", gap: space[2] })

const status = (text: string | null, h: AuthenticationViewBuilder): ReadonlyArray<Html> =>
  text === null
    ? []
    : [
        AppText.view(
          {
            element: "p",
            appearance: "footnote",
            isMuted: true,
            attributes: [h.Role("status"), h.Attribute("aria-live", "polite")],
            children: [text],
          },
          h,
        ),
      ]

const heading = (text: string, h: AuthenticationViewBuilder) =>
  AppText.view(
    { element: "h1", appearance: "xl", weight: "semibold", tone: "secondary", children: [text] },
    h,
  )

const textField = (
  config: Readonly<{
    id: string
    label: string
    value: string
    attributes: ReadonlyArray<Attribute<typeof Message.Type>>
    onInput: (value: string) => typeof Message.Type
    error: string | null
  }>,
  h: AuthenticationViewBuilder,
) =>
  AppField.view(
    {
      label: config.label,
      labelAttributes: [h.For(config.id)],
      error: Option.fromNullishOr(config.error),
      control: AppInput.view(
        {
          attributes: [
            h.Id(config.id),
            h.Value(config.value),
            h.Required(true),
            h.OnInput(config.onInput),
            ...config.attributes,
          ],
        },
        h,
      ),
    },
    h,
  )

const notices: Readonly<Record<AuthenticationNotice, MessageDescriptor>> = {
  LinkFailed: msg`This link didn't work. It may have expired or been opened in another browser. Enter your email to get a new one.`,
  SendFailed: msg`We couldn't send the email. Check the address and try again.`,
  CodeResent: msg`We sent a new email. Earlier codes no longer work.`,
  CodeFailed: msg`This code didn't work. Check it, or resend the email to get another one.`,
  SomethingWentWrong: msg`Something went wrong. Try again.`,
}

export const view = AuthenticationComposition.makeView.withInputs<LanguageInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, { language }, h): Html => {
    const i18n = translatorFor(language)
    const noticeText = (nullableNotice: AuthenticationNotice | null) =>
      nullableNotice === null ? null : i18n._(notices[nullableNotice])

    return h.main(
      styledAttributes([], pageStyle),
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
          heading(i18n._(msg`Sign in or create your account`), h),
          h.form(styledAttributes([h.OnSubmit(Message.SubmittedEmail())], formStyle), [
            textField(
              {
                id: "authentication-email",
                label: i18n._(msg`Email`),
                value: email,
                attributes: [
                  h.Type("email"),
                  h.Name("email"),
                  h.Attribute("maxlength", "320"),
                  h.Attribute("autocomplete", "email"),
                ],
                onInput: (value) => Message.UpdatedEmail({ value }),
                error: noticeText(error),
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
        ],
        AwaitingCode: ({ pending, isEnteringCode, code, isBusy, canResend, notice }) => [
          heading(i18n._(msg`Check your email`), h),
          AppText.view(
            {
              element: "p",
              children: [
                i18n._(msg`To continue, click the link sent to`),
                " ",
                AppText.view({ element: "strong", attributes: [], children: [pending.email] }, h),
              ],
            },
            h,
          ),
          isEnteringCode
            ? h.form(styledAttributes([h.OnSubmit(Message.SubmittedCode())], formStyle), [
                textField(
                  {
                    id: "authentication-code",
                    label: i18n._(msg`Verification code`),
                    value: code,
                    attributes: [
                      h.Type("text"),
                      h.Name("code"),
                      h.Attribute("inputmode", "numeric"),
                      h.Attribute("autocomplete", "one-time-code"),
                      h.Attribute("pattern", "[0-9]{6}"),
                      h.Attribute("maxlength", "6"),
                    ],
                    onInput: (value) => Message.UpdatedCode({ value }),
                    error: null,
                  },
                  h,
                ),
                AppButton.view(
                  {
                    type: "submit",
                    tone: "primary",
                    isDisabled: isBusy || code.length !== 6,
                    children: [isBusy ? i18n._(msg`Verifying…`) : i18n._(msg`Verify`)],
                  },
                  h,
                ),
              ])
            : AppButton.view(
                {
                  tone: "primary",
                  onClick: Message.ClickedEnterCode(),
                  children: [i18n._(msg`Enter code`)],
                },
                h,
              ),
          h.div(styledAttributes([], actionsStyle), [
            AppButton.view(
              {
                mode: "outline",
                isDisabled: isBusy || !canResend,
                onClick: Message.ClickedResend(),
                children: [i18n._(msg`Resend email`)],
              },
              h,
            ),
            AppButton.view(
              {
                mode: "outline",
                isDisabled: isBusy,
                onClick: Message.ClickedUseDifferentEmail(),
                children: [i18n._(msg`Use another email`)],
              },
              h,
            ),
          ]),
          ...status(noticeText(notice), h),
        ],
        Onboarding: ({ name, isSaving, error }) => [
          heading(i18n._(msg`Welcome to Gororobas!`), h),
          h.form(styledAttributes([h.OnSubmit(Message.SubmittedName())], formStyle), [
            textField(
              {
                id: "authentication-name",
                label: i18n._(msg`What should we call you?`),
                value: name,
                attributes: [
                  h.Type("text"),
                  h.Name("name"),
                  h.Attribute("maxlength", "128"),
                  h.Attribute("autocomplete", "name"),
                ],
                onInput: (value) => Message.UpdatedName({ value }),
                error: noticeText(error),
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
        ],
        SignedIn: ({ name, isSigningOut, connection }) => [
          AppCard.view(
            {
              kind: "panel",
              styles: [formStyle],
              children: [
                heading(i18n._(msg`Hi, ${name}`), h),
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
                      href: myPlacesUrl(language),
                      children: [i18n._(msg`My places`)],
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
              ],
            },
            h,
          ),
        ],
      }),
    )
  },
)
