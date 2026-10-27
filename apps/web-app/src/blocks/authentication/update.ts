import { Array as EffectArray, Predicate } from "effect"

import {
  CheckConnection,
  CompleteOnboarding,
  ResendCode,
  RestoreSession,
  SendCode,
  SignOut,
  VerifyCode,
  WaitForResendCooldown,
} from "./command"
import { AuthenticationComposition } from "./composition"
import { RestoredSession } from "./message"
import { type PendingCode, awaitingCode, enteringEmail, isSignedIn, signedIn } from "./model"

const sentCode = (pending: PendingCode, notice?: string) => ({
  model: {
    stage: awaitingCode({ pending, canResend: false, ...(notice === undefined ? {} : { notice }) }),
  },
  commands: [WaitForResendCooldown({ sentAt: pending.sentAt })],
})

export const update = AuthenticationComposition.makeUpdate({
  RequestedRestoreSession: (model) => ({ model, commands: [RestoreSession()] }),
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
  UpdatedEmail: (model, { value }) =>
    Predicate.isTagged(model.stage, "EnteringEmail")
      ? { model: { stage: { ...model.stage, email: value } } }
      : { model },
  SubmittedEmail: (model) =>
    Predicate.isTagged(model.stage, "EnteringEmail") && !model.stage.isSending
      ? {
          model: { stage: { ...model.stage, isSending: true, error: null } },
          commands: [SendCode({ email: model.stage.email })],
        }
      : { model },
  ClickedEnterCode: (model) =>
    Predicate.isTagged(model.stage, "AwaitingCode")
      ? { model: { stage: { ...model.stage, isEnteringCode: true, notice: null } } }
      : { model },
  UpdatedCode: (model, { value }) =>
    Predicate.isTagged(model.stage, "AwaitingCode")
      ? { model: { stage: { ...model.stage, code: value.replace(/\D/g, "").slice(0, 6) } } }
      : { model },
  SubmittedCode: (model) =>
    Predicate.isTagged(model.stage, "AwaitingCode") &&
    !model.stage.isBusy &&
    model.stage.code.length === 6
      ? {
          model: { stage: { ...model.stage, isBusy: true, notice: null } },
          commands: [VerifyCode({ pending: model.stage.pending, code: model.stage.code })],
        }
      : { model },
  ClickedResend: (model) =>
    Predicate.isTagged(model.stage, "AwaitingCode") && !model.stage.isBusy && model.stage.canResend
      ? {
          model: { stage: { ...model.stage, isBusy: true, notice: null } },
          commands: [ResendCode({ pending: model.stage.pending })],
        }
      : { model },
  ClickedUseDifferentEmail: (model) =>
    Predicate.isTagged(model.stage, "AwaitingCode")
      ? { model: { stage: enteringEmail(model.stage.pending.email) } }
      : { model },
  UpdatedName: (model, { value }) =>
    Predicate.isTagged(model.stage, "Onboarding")
      ? { model: { stage: { ...model.stage, name: value } } }
      : { model },
  SubmittedName: (model) =>
    Predicate.isTagged(model.stage, "Onboarding") && !model.stage.isSaving
      ? {
          model: { stage: { ...model.stage, isSaving: true, error: null } },
          commands: [CompleteOnboarding({ name: model.stage.name })],
        }
      : { model },
  ClickedSignOut: (model) =>
    Predicate.isTagged(model.stage, "SignedIn") && !model.stage.isSigningOut
      ? { model: { stage: { ...model.stage, isSigningOut: true } }, commands: [SignOut()] }
      : { model },
  CompletedRestoreSession: (model, { session }) =>
    RestoredSession.match(session, {
      SignedOut: () =>
        Predicate.isTagged(model.stage, "Restoring") || isSignedIn(model)
          ? { model: { stage: enteringEmail() } }
          : { model },
      AwaitingCode: ({ pending, canResend }) =>
        canResend ? { model: { stage: awaitingCode({ pending, canResend }) } } : sentCode(pending),
      SignedIn: ({ name, connection }) => ({
        model: { stage: signedIn(name, connection) },
        commands: EffectArray.filter([CheckConnection()], () => connection === "Checking"),
      }),
      FailedLink: () => ({
        model: {
          stage: enteringEmail(
            "",
            "Esse link não funcionou. Ele pode ter expirado ou sido aberto em outro navegador. Digite seu email para receber um novo.",
          ),
        },
      }),
    }),
  SucceededSendCode: (_, { pending }) => sentCode(pending),
  FailedSendCode: (model, { error }) =>
    Predicate.isTagged(model.stage, "EnteringEmail")
      ? { model: { stage: { ...model.stage, isSending: false, error } } }
      : { model },
  SucceededResendCode: (model, { pending }) =>
    Predicate.isTagged(model.stage, "AwaitingCode")
      ? sentCode(pending, "Enviamos um novo email. Os códigos anteriores não funcionam mais.")
      : { model },
  FailedResendCode: (model, { error }) =>
    Predicate.isTagged(model.stage, "AwaitingCode")
      ? { model: { stage: { ...model.stage, isBusy: false, notice: error } } }
      : { model },
  CompletedWaitForResendCooldown: (model, { sentAt }) =>
    Predicate.isTagged(model.stage, "AwaitingCode") && model.stage.pending.sentAt === sentAt
      ? { model: { stage: { ...model.stage, canResend: true } } }
      : { model },
  SucceededVerifyCode: (_, { name }) => ({ model: { stage: signedIn(name) } }),
  FailedVerifyCode: (model, { error }) =>
    Predicate.isTagged(model.stage, "AwaitingCode")
      ? { model: { stage: { ...model.stage, isBusy: false, notice: error } } }
      : { model },
  SucceededCompleteOnboarding: (_, { name }) => ({ model: { stage: signedIn(name) } }),
  FailedCompleteOnboarding: (model, { error }) =>
    Predicate.isTagged(model.stage, "Onboarding")
      ? { model: { stage: { ...model.stage, isSaving: false, error } } }
      : { model },
  SucceededSignOut: () => ({ model: { stage: enteringEmail() } }),
  FailedSignOut: (model) =>
    Predicate.isTagged(model.stage, "SignedIn")
      ? { model: { stage: { ...model.stage, isSigningOut: false } } }
      : { model },
})
