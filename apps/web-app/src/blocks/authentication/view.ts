import { Style } from "@pleat/core"
import { Option } from "effect"
import type { Attribute, Html } from "foldkit/html"

import { AppButton } from "../../ui/app-button"
import { AppCard } from "../../ui/app-card"
import { AppField } from "../../ui/app-field"
import { AppInput } from "../../ui/app-input"
import { AppText } from "../../ui/app-text"
import { styledAttributes } from "../../ui/pleat-attributes"
import { measure, space } from "../../ui/theme"
import { AuthenticationComposition, type AuthenticationViewBuilder } from "./composition"
import { Message } from "./message"
import { Stage } from "./model"

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

export const view = AuthenticationComposition.makeView((model, h): Html =>
  h.main(
    styledAttributes([], pageStyle),
    Stage.match(model.stage, {
      Restoring: () => [
        AppText.view(
          { element: "p", attributes: [h.Role("status")], children: ["Verificando sua sessão…"] },
          h,
        ),
      ],
      EnteringEmail: ({ email, isSending, error }) => [
        heading("Entre ou crie sua conta", h),
        h.form(styledAttributes([h.OnSubmit(Message.SubmittedEmail())], formStyle), [
          textField(
            {
              id: "authentication-email",
              label: "Email",
              value: email,
              attributes: [
                h.Type("email"),
                h.Name("email"),
                h.Attribute("maxlength", "320"),
                h.Attribute("autocomplete", "email"),
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
              children: [isSending ? "Enviando…" : "Continuar com email"],
            },
            h,
          ),
        ]),
      ],
      AwaitingCode: ({ pending, isEnteringCode, code, isBusy, canResend, notice }) => [
        heading("Confira seu email", h),
        AppText.view(
          {
            element: "p",
            children: [
              "Para continuar, clique no link enviado para ",
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
                  label: "Código de verificação",
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
                  children: [isBusy ? "Verificando…" : "Verificar"],
                },
                h,
              ),
            ])
          : AppButton.view(
              {
                tone: "primary",
                onClick: Message.ClickedEnterCode(),
                children: ["Digitar código"],
              },
              h,
            ),
        h.div(styledAttributes([], actionsStyle), [
          AppButton.view(
            {
              mode: "outline",
              isDisabled: isBusy || !canResend,
              onClick: Message.ClickedResend(),
              children: ["Reenviar email"],
            },
            h,
          ),
          AppButton.view(
            {
              mode: "outline",
              isDisabled: isBusy,
              onClick: Message.ClickedUseDifferentEmail(),
              children: ["Usar outro email"],
            },
            h,
          ),
        ]),
        ...status(notice, h),
      ],
      Onboarding: ({ name, isSaving, error }) => [
        heading("Boas-vindas ao Gororobas!", h),
        h.form(styledAttributes([h.OnSubmit(Message.SubmittedName())], formStyle), [
          textField(
            {
              id: "authentication-name",
              label: "Como podemos te chamar?",
              value: name,
              attributes: [
                h.Type("text"),
                h.Name("name"),
                h.Attribute("maxlength", "128"),
                h.Attribute("autocomplete", "name"),
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
              children: [isSaving ? "Salvando…" : "Continuar"],
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
              heading(`Olá, ${name}`, h),
              ...status(
                connection === "Offline"
                  ? "Você está offline ou o servidor está indisponível. Sua conta segue disponível neste aparelho; ações online esperam a sessão ser verificada."
                  : connection === "Checking"
                    ? "Verificando sua sessão antes de ações online…"
                    : null,
                h,
              ),
              AppButton.view(
                {
                  mode: "outline",
                  isDisabled: isSigningOut,
                  onClick: Message.ClickedSignOut(),
                  children: ["Sair"],
                },
                h,
              ),
            ],
          },
          h,
        ),
      ],
    }),
  ),
)
