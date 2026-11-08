import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import { Array as EffectArray, Predicate } from "effect"

import {
  CODE_FIELD_ID,
  CheckConnection,
  CompleteOnboarding,
  EMAIL_FIELD_ID,
  FocusField,
  NAME_FIELD_ID,
  ReloadPage,
  ResendCode,
  RestoreSession,
  SendCode,
  SignOut,
  VerifyCode,
  WaitForResendCooldown,
} from "./command"
import { AuthenticationComposition } from "./composition"
import { OutMessage, RestoredSession } from "./message"
import {
  CODE_LENGTH,
  type AuthenticationNotice,
  type Model,
  type PendingCode,
  awaitingCode,
  enteringEmail,
  isSignedIn,
  signedIn,
} from "./model"

/** The code field is where the next step happens: it takes focus as soon as the email is sent. */
const sentCode = (pending: PendingCode, notice?: AuthenticationNotice) => ({
  model: {
    stage: awaitingCode({ pending, canResend: false, ...(notice === undefined ? {} : { notice }) }),
  },
  commands: [WaitForResendCooldown({ sentAt: pending.sentAt }), FocusField({ id: CODE_FIELD_ID })],
})

const verifyCode = (model: Model) =>
  Predicate.isTagged(model.stage, "AwaitingCode") &&
  !model.stage.isBusy &&
  model.stage.code.length === CODE_LENGTH
    ? {
        model: { stage: { ...model.stage, isBusy: true, notice: null } },
        commands: [VerifyCode({ pending: model.stage.pending, code: model.stage.code })],
      }
    : { model }

const signOut = (model: Model) =>
  Predicate.isTagged(model.stage, "SignedIn") && !model.stage.isSigningOut
    ? { model: { stage: { ...model.stage, isSigningOut: true } }, commands: [SignOut()] }
    : { model }

export const inMessageUpdate = AuthenticationComposition.makeInMessageUpdate({
  RequestedRestoreSession: (model) => ({ model, commands: [RestoreSession()] }),
  RequestedSignOut: signOut,
})

export const update = AuthenticationComposition.makeUpdate.withContext(
  (language: SupportedLanguage) => ({
    ChangedSessionAccess: (model, { state }) => {
      const { stage } = model

      if (
        state.status === "SignedOut" &&
        (isSignedIn(model) || Predicate.isTagged(stage, "Restoring"))
      ) {
        return { model: { stage: enteringEmail() } }
      }

      if (
        state.identity !== null &&
        (Predicate.isTagged(stage, "SignedIn") || Predicate.isTagged(stage, "Restoring"))
      ) {
        return { model: { stage: signedIn(state.identity.name, state.status) } }
      }

      return { model }
    },
    ChangedConnection: (model) => ({ model, commands: [CheckConnection()] }),
    SwitchedAccount: (model) => ({ model, commands: [ReloadPage()] }),
    UpdatedEmail: (model, { value }) =>
      Predicate.isTagged(model.stage, "EnteringEmail")
        ? { model: { stage: { ...model.stage, email: value } } }
        : { model },
    SubmittedEmail: (model) =>
      Predicate.isTagged(model.stage, "EnteringEmail") && !model.stage.isSending
        ? {
            model: { stage: { ...model.stage, isSending: true, error: null } },
            commands: [SendCode({ email: model.stage.email, language })],
          }
        : { model },
    // A complete code submits itself, whether typed, pasted or filled from the email by the device.
    UpdatedCode: (model, { value }) =>
      Predicate.isTagged(model.stage, "AwaitingCode")
        ? verifyCode({
            stage: { ...model.stage, code: value.replace(/\D/g, "").slice(0, CODE_LENGTH) },
          })
        : { model },
    SubmittedCode: verifyCode,
    ClickedResend: (model) =>
      Predicate.isTagged(model.stage, "AwaitingCode") &&
      !model.stage.isBusy &&
      model.stage.canResend
        ? {
            model: { stage: { ...model.stage, isBusy: true, notice: null } },
            commands: [ResendCode({ pending: model.stage.pending, language })],
          }
        : { model },
    ClickedUseDifferentEmail: (model) =>
      Predicate.isTagged(model.stage, "AwaitingCode")
        ? {
            model: { stage: enteringEmail(model.stage.pending.email) },
            commands: [FocusField({ id: EMAIL_FIELD_ID })],
          }
        : { model },
    UpdatedName: (model, { value }) =>
      Predicate.isTagged(model.stage, "Onboarding")
        ? { model: { stage: { ...model.stage, name: value } } }
        : { model },
    SubmittedName: (model) =>
      Predicate.isTagged(model.stage, "Onboarding") && !model.stage.isSaving
        ? {
            model: { stage: { ...model.stage, isSaving: true, error: null } },
            commands: [CompleteOnboarding({ name: model.stage.name, language })],
          }
        : { model },
    ClickedSignOut: signOut,
    CompletedRestoreSession: (model, { session }) =>
      RestoredSession.match(session, {
        SignedOut: () =>
          Predicate.isTagged(model.stage, "Restoring") || isSignedIn(model)
            ? { model: { stage: enteringEmail() } }
            : { model },
        AwaitingCode: ({ pending, canResend }) =>
          canResend
            ? {
                model: { stage: awaitingCode({ pending, canResend }) },
                commands: [FocusField({ id: CODE_FIELD_ID })],
              }
            : sentCode(pending),
        SignedIn: ({ name, connection }) => ({
          model: { stage: signedIn(name, connection) },
          commands: EffectArray.filter([CheckConnection()], () => connection === "Checking"),
        }),
        FailedLink: () => ({
          model: {
            stage: enteringEmail("", "LinkFailed"),
          },
        }),
      }),
    SucceededSendCode: (_, { pending }) => sentCode(pending),
    FailedSendCode: (model, { error }) =>
      Predicate.isTagged(model.stage, "EnteringEmail")
        ? { model: { stage: { ...model.stage, isSending: false, error } } }
        : { model },
    SucceededResendCode: (model, { pending }) =>
      Predicate.isTagged(model.stage, "AwaitingCode") ? sentCode(pending, "CodeResent") : { model },
    FailedResendCode: (model, { error }) =>
      Predicate.isTagged(model.stage, "AwaitingCode")
        ? { model: { stage: { ...model.stage, isBusy: false, notice: error } } }
        : { model },
    CompletedWaitForResendCooldown: (model, { sentAt }) =>
      Predicate.isTagged(model.stage, "AwaitingCode") && model.stage.pending.sentAt === sentAt
        ? { model: { stage: { ...model.stage, canResend: true } } }
        : { model },
    SucceededVerifyCode: (_, { name }) => ({
      model: { stage: signedIn(name) },
      // New accounts continue with their name; others see the page again as themselves.
      commands: [name === null ? FocusField({ id: NAME_FIELD_ID }) : ReloadPage()],
    }),
    // A wrong code is cleared so the next attempt starts from an empty field.
    FailedVerifyCode: (model, { error }) =>
      Predicate.isTagged(model.stage, "AwaitingCode")
        ? {
            model: { stage: { ...model.stage, code: "", isBusy: false, notice: error } },
            commands: [FocusField({ id: CODE_FIELD_ID })],
          }
        : { model },
    SucceededCompleteOnboarding: (_, { name }) => ({
      model: { stage: signedIn(name) },
      outMessage: OutMessage.CompletedOnboarding(),
    }),
    FailedCompleteOnboarding: (model, { error }) =>
      Predicate.isTagged(model.stage, "Onboarding")
        ? { model: { stage: { ...model.stage, isSaving: false, error } } }
        : { model },
    SucceededSignOut: () => ({ model: { stage: enteringEmail() } }),
    FailedSignOut: (model) =>
      Predicate.isTagged(model.stage, "SignedIn")
        ? { model: { stage: { ...model.stage, isSigningOut: false } } }
        : { model },
    CompletedFocusField: (model) => ({ model }),
    CompletedReloadPage: (model) => ({ model }),
  }),
)
