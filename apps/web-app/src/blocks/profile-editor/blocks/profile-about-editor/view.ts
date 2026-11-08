import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import { Handle } from "@gororobas/domain/common/primitives"
import type { PersonProfileRow as PersonProfileRowSchema } from "@gororobas/domain/profiles/domain"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { Style } from "@pleat/core"
import { Option, Schema } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { profileUrl } from "../../../../app/route"
import type { LanguageInputs } from "../../../../lib/language"
import { type Translator, translatorFor } from "../../../../lib/translations"
import { imageUrl } from "../../../../media-urls"
import { AppButton } from "../../../../ui/app-button"
import { AppField } from "../../../../ui/app-field"
import { AppInput, AppTextarea } from "../../../../ui/app-input"
import { AppText } from "../../../../ui/app-text"
import * as Icons from "../../../../ui/icons"
import { styledAttributes } from "../../../../ui/pleat-attributes"
import { profileAvatar } from "../../../../ui/profile-avatar/view"
import { SectionCard } from "../../../../ui/section-card"
import { breakpoint, space, tones } from "../../../../ui/theme"
import { ProfileAboutEditorComposition, type ProfileAboutEditorViewBuilder } from "./composition"
import { isFormChanged } from "./form"
import { Message } from "./message"
import { type Form, HandleCheck, type Model, type SaveError, SaveStatus } from "./model"

type PersonProfileRow = typeof PersonProfileRowSchema.Type

/** Where profiles are shared from, shown so people see the address their handle makes. */
const PUBLIC_HOST = "gororobas.com"

const NAME_FIELD_ID = "profile-about-name"
const HANDLE_FIELD_ID = "profile-about-handle"
const BIO_FIELD_ID = "profile-about-bio"

const formStyle = Style.make({ display: "grid", rowGap: space[5] })
const handleGroupStyle = Style.make({ display: "grid", rowGap: space[2] })
const welcomeStyle = Style.make({ color: tones.primary.shade[800] })

const photoRowStyle = Style.make({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: space[4],
})

const photoActionsStyle = Style.make({ display: "grid", rowGap: space[2], justifyItems: "start" })
const buttonRowStyle = Style.make({ display: "flex", flexWrap: "wrap", gap: space[2] })

const footerStyle = Style.make({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space[3],
}).pipe(Style.when(breakpoint.sm, { flexWrap: "nowrap" }))

const handleStatusStyle = Style.make({ display: "flex", alignItems: "center", gap: space[1] })

const saveErrors: Readonly<Record<SaveError, MessageDescriptor>> = {
  NameMissing: msg`Your name can't be empty.`,
  HandleInvalid: msg`Fix your handle before saving.`,
  HandleTaken: msg`Someone already uses this handle. Try another one.`,
  PhotoInvalid: msg`This photo can't be used. Upload another image.`,
  SaveFailed: msg`Couldn't save your changes. Try again in a moment.`,
}

const caption = (
  {
    text,
    tone,
    isLive = false,
  }: Readonly<{ text: string; tone?: "destructive" | "primary"; isLive?: boolean }>,
  h: ProfileAboutEditorViewBuilder,
) =>
  AppText.view(
    {
      element: "p",
      appearance: "footnote",
      ...(tone === undefined ? { isMuted: true } : { tone }),
      attributes: isLive ? [h.Role("status"), h.Attribute("aria-live", "polite")] : [],
      children: [text],
    },
    h,
  )

const photoField = (
  { form, model, i18n }: Readonly<{ form: Form; model: Model; i18n: Translator }>,
  h: ProfileAboutEditorViewBuilder,
) => {
  const isUploading = model.photoUpload === "Uploading"
  const hasPhoto = Option.isSome(form.maybePhotoId)

  return h.div(styledAttributes([], photoRowStyle), [
    profileAvatar(
      {
        name: form.name.trim() === "" ? "?" : form.name,
        maybePhotoUrl: Option.map(form.maybePhotoId, (id) => imageUrl(id, 300)),
        size: "large",
      },
      h,
    ),
    h.div(styledAttributes([], photoActionsStyle), [
      h.div(styledAttributes([], buttonRowStyle), [
        AppButton.view(
          {
            mode: "outline",
            size: "sm",
            isDisabled: isUploading,
            onClick: Message.ClickedChoosePhoto(),
            children: [
              Icons.camera({ size: "sm" }),
              isUploading
                ? i18n._(msg`Uploading…`)
                : hasPhoto
                  ? i18n._(msg`Change photo`)
                  : i18n._(msg`Upload a photo`),
            ],
          },
          h,
        ),
        ...(hasPhoto
          ? [
              AppButton.view(
                {
                  mode: "faded",
                  size: "sm",
                  isDisabled: isUploading,
                  onClick: Message.ClickedRemovePhoto(),
                  children: [i18n._(msg`Remove`)],
                },
                h,
              ),
            ]
          : []),
      ]),
      model.photoUpload === "Failed"
        ? caption(
            {
              text: i18n._(msg`Couldn't upload this image. Try another one.`),
              tone: "destructive",
              isLive: true,
            },
            h,
          )
        : caption({ text: i18n._(msg`A square photo of you or your garden works best.`) }, h),
    ]),
  ])
}

const handleStatus = (
  { check, i18n, url }: Readonly<{ check: HandleCheck; i18n: Translator; url: string }>,
  h: ProfileAboutEditorViewBuilder,
): Html =>
  HandleCheck.match(check, {
    Unchanged: () => caption({ text: i18n._(msg`Your profile lives at ${url}`) }, h),
    Checking: () => caption({ text: i18n._(msg`Checking if it's free…`), isLive: true }, h),
    Available: () =>
      h.div(styledAttributes([h.Role("status")], handleStatusStyle), [
        Icons.check({ size: "sm", tone: "primary" }),
        caption({ text: i18n._(msg`Available. Your profile would move to ${url}`) }, h),
      ]),
    Taken: () =>
      caption(
        {
          text: i18n._(msg`Someone already uses this handle. Try another one.`),
          tone: "destructive",
          isLive: true,
        },
        h,
      ),
    Invalid: () =>
      caption(
        {
          text: i18n._(msg`Use 3 to 90 lowercase letters, numbers and hyphens.`),
          tone: "destructive",
          isLive: true,
        },
        h,
      ),
    Unknown: () =>
      caption(
        { text: i18n._(msg`Couldn't check it right now. Saving will tell.`), isLive: true },
        h,
      ),
  })

const saveStatus = (
  { save, isChanged, i18n }: Readonly<{ save: SaveStatus; isChanged: boolean; i18n: Translator }>,
  h: ProfileAboutEditorViewBuilder,
): Html =>
  SaveStatus.match(save, {
    Idle: () =>
      caption({ text: isChanged ? i18n._(msg`You have unsaved changes.`) : "", isLive: true }, h),
    Saving: () => caption({ text: i18n._(msg`Saving…`), isLive: true }, h),
    Saved: () => caption({ text: i18n._(msg`Saved.`), tone: "primary", isLive: true }, h),
    Failed: ({ error }) =>
      caption({ text: i18n._(saveErrors[error]), tone: "destructive", isLive: true }, h),
  })

/** After onboarding, an empty profile invites what makes it recognizable. */
const welcome = (i18n: Translator, h: ProfileAboutEditorViewBuilder) =>
  h.div(styledAttributes([], welcomeStyle), [
    AppText.view(
      {
        element: "p",
        appearance: "footnote",
        children: [
          i18n._(
            msg`Add a photo and a few words about yourself, so people know who they're talking to.`,
          ),
        ],
      },
      h,
    ),
  ])

const editor = (
  {
    model,
    profile,
    language,
  }: Readonly<{ model: Model; profile: PersonProfileRow; language: SupportedLanguage }>,
  h: ProfileAboutEditorViewBuilder,
) => {
  const i18n = translatorFor(language)
  const { form } = model
  const isChanged = isFormChanged(profile, form)
  const isSaving = SaveStatus.guards.Saving(model.save)
  const publicUrl = `${PUBLIC_HOST}${profileUrl(language, {
    handle: Option.getOrElse(Schema.decodeOption(Handle)(form.handle), () => profile.handle),
  })}`

  return h.form(styledAttributes([h.OnSubmit(Message.SubmittedForm())], formStyle), [
    ...(profile.bio === null && profile.photoId === null ? [welcome(i18n, h)] : []),
    photoField({ form, model, i18n }, h),
    AppField.view(
      {
        label: i18n._(msg`Name`),
        labelAttributes: [h.For(NAME_FIELD_ID)],
        description: i18n._(msg`How people see you across Gororobas.`),
        control: AppInput.view<typeof Message.Type>(
          {
            attributes: [
              h.Id(NAME_FIELD_ID),
              h.Value(form.name),
              h.Required(true),
              h.Attribute("maxlength", "128"),
              h.Attribute("autocomplete", "name"),
              h.OnInput((value) => Message.UpdatedName({ value })),
            ],
          },
          h,
        ),
      },
      h,
    ),
    h.div(styledAttributes([], handleGroupStyle), [
      AppField.view(
        {
          label: i18n._(msg`Handle`),
          labelAttributes: [h.For(HANDLE_FIELD_ID)],
          control: AppInput.view<typeof Message.Type>(
            {
              prefix: "@",
              attributes: [
                h.Id(HANDLE_FIELD_ID),
                h.Value(form.handle),
                h.Required(true),
                h.Attribute("maxlength", "90"),
                h.Attribute("autocapitalize", "none"),
                h.Attribute("autocomplete", "username"),
                h.Attribute("spellcheck", "false"),
                h.Attribute(
                  "aria-invalid",
                  HandleCheck.guards.Taken(model.handleCheck) ||
                    HandleCheck.guards.Invalid(model.handleCheck)
                    ? "true"
                    : "false",
                ),
                h.OnInput((value) => Message.UpdatedHandle({ value })),
              ],
            },
            h,
          ),
        },
        h,
      ),
      handleStatus({ check: model.handleCheck, i18n, url: publicUrl }, h),
    ]),
    AppField.view(
      {
        label: i18n._(msg`About you`),
        labelAttributes: [h.For(BIO_FIELD_ID)],
        description: i18n._(
          msg`What you grow, what you're learning, what you can share. Leave a blank line between paragraphs.`,
        ),
        control: AppTextarea.view<typeof Message.Type>(
          {
            attributes: [
              h.Id(BIO_FIELD_ID),
              h.Value(form.bio),
              h.Rows(6),
              h.Attribute("maxlength", "4000"),
              h.OnInput((value) => Message.UpdatedBio({ value })),
            ],
          },
          h,
        ),
      },
      h,
    ),
    h.div(styledAttributes([], footerStyle), [
      saveStatus({ save: model.save, isChanged, i18n }, h),
      h.div(styledAttributes([], buttonRowStyle), [
        ...(isChanged
          ? [
              AppButton.view(
                {
                  mode: "outline",
                  isDisabled: isSaving,
                  onClick: Message.ClickedDiscardChanges(),
                  children: [i18n._(msg`Discard`)],
                },
                h,
              ),
            ]
          : []),
        AppButton.view(
          {
            type: "submit",
            tone: "primary",
            isDisabled:
              !isChanged ||
              isSaving ||
              model.photoUpload === "Uploading" ||
              HandleCheck.guards.Taken(model.handleCheck),
            children: [isSaving ? i18n._(msg`Saving…`) : i18n._(msg`Save changes`)],
          },
          h,
        ),
      ]),
    ]),
  ])
}

export const view = ProfileAboutEditorComposition.makeView.withInputs<LanguageInputs>(
  // oxlint-disable-next-line custom-lint-rules/no-many-function-parameters -- Foldkit's view signature: Model, view inputs and builder.
  (model, { language }, h): Html => {
    const i18n = translatorFor(language)
    const maybeProfile = AsyncData.getData(model.profile)

    return SectionCard.view(
      {
        title: i18n._(msg`About me`),
        icon: Icons.user,
        headingElement: "h2",
        tone: "neutral",
        ...Option.match(maybeProfile, {
          onNone: () => ({}),
          onSome: (profile) => ({
            footerLink: {
              label: i18n._(msg`See your public profile`),
              href: profileUrl(language, { handle: profile.handle }),
            },
          }),
        }),
        children: AsyncData.matchData(model.profile, {
          onEmpty: () => [caption({ text: i18n._(msg`Loading your profile…`), isLive: true }, h)],
          onFailure: () => [
            caption(
              {
                text: i18n._(msg`Couldn't load your profile. Try again in a moment.`),
                tone: "destructive",
                isLive: true,
              },
              h,
            ),
          ],
          onData: (profile) => [editor({ model, profile, language }, h)],
        }),
      },
      h,
    )
  },
)
