import {
  AuthenticationApi,
  EmailCodeRequest,
  DEFAULT_AUTHENTICATION_RETURN_TARGET,
} from "@gororobas/domain/authentication/auth-contract"
import { OnboardingInput } from "@gororobas/domain/people/domain"
import { Client, Operations, Proofs } from "@yielded/auth"
import { Clock, Duration, Effect, Layer, Option, Predicate, Schema } from "effect"
import { Command, Update } from "foldkit"
import { HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { defineView } from "foldkit/submodel"

import { GororobasApiClient } from "./api-client"

export const AuthenticationClient = Client.make(AuthenticationApi, {
  baseUrl: window.location.origin,
})

export const resources = AuthenticationClient.layerFetch.pipe(Layer.orDie)

// MODEL

/** A requested code. Public: the code itself only exists in the email and in what the person types. */
export const PendingCode = Schema.Struct({
  flowId: Operations.RequestBindingFlowId,
  email: EmailCodeRequest.fields.email,
  reference: Proofs.ProofReference,
  sentAt: Schema.Number,
})

export type PendingCode = typeof PendingCode.Type

export const Stage = defineTaggedUnion({
  Restoring: {},
  EnteringEmail: {
    email: Schema.String,
    isSending: Schema.Boolean,
    error: Schema.NullOr(Schema.String),
  },
  AwaitingCode: {
    pending: PendingCode,
    isEnteringCode: Schema.Boolean,
    code: Schema.String,
    isBusy: Schema.Boolean,
    canResend: Schema.Boolean,
    notice: Schema.NullOr(Schema.String),
  },
  Onboarding: {
    name: Schema.String,
    isSaving: Schema.Boolean,
    error: Schema.NullOr(Schema.String),
  },
  SignedIn: { name: Schema.String, isSigningOut: Schema.Boolean },
})

export type Stage = typeof Stage.Type

export const Model = Schema.Struct({ stage: Stage })
export type Model = typeof Model.Type

export const init: Model = { stage: Stage.Restoring() }

export const isSignedIn = (model: Model) =>
  Predicate.isTagged(model.stage, "SignedIn") || Predicate.isTagged(model.stage, "Onboarding")

const enteringEmail = (email = "", error: string | null = null) =>
  Stage.EnteringEmail({ email, isSending: false, error })

const awaitingCode = (input: {
  readonly pending: PendingCode
  readonly canResend: boolean
  readonly notice?: string
}) =>
  Stage.AwaitingCode({
    pending: input.pending,
    isEnteringCode: false,
    code: "",
    isBusy: false,
    canResend: input.canResend,
    notice: input.notice ?? null,
  })

/** `null` until onboarding gives the account a profile. */
const signedIn = (name: string | null) =>
  name === null
    ? Stage.Onboarding({ name: "", isSaving: false, error: null })
    : Stage.SignedIn({ name, isSigningOut: false })

// MESSAGE

export const RestoredSession = defineTaggedUnion({
  SignedOut: {},
  AwaitingCode: { pending: PendingCode, canResend: Schema.Boolean },
  SignedIn: { name: Schema.NullOr(Schema.String) },
  /** The emailed link couldn't sign in: expired, already used, or opened in another browser. */
  FailedLink: {},
})

export const Message = defineMessageUnion({
  UpdatedEmail: { value: Schema.String },
  SubmittedEmail: {},
  ClickedEnterCode: {},
  UpdatedCode: { value: Schema.String },
  SubmittedCode: {},
  ClickedResend: {},
  ClickedUseDifferentEmail: {},
  UpdatedName: { value: Schema.String },
  SubmittedName: {},
  ClickedSignOut: {},
  CompletedRestoreSession: { session: RestoredSession },
  SucceededSendCode: { pending: PendingCode },
  FailedSendCode: { error: Schema.String },
  SucceededResendCode: { pending: PendingCode },
  FailedResendCode: { error: Schema.String },
  CompletedWaitForResendCooldown: { sentAt: Schema.Number },
  SucceededVerifyCode: { name: Schema.NullOr(Schema.String) },
  FailedVerifyCode: { error: Schema.String },
  SucceededCompleteOnboarding: { name: Schema.String },
  FailedCompleteOnboarding: { error: Schema.String },
  SucceededSignOut: {},
  FailedSignOut: {},
})

export type Message = typeof Message.Type

// COMMAND

/** Matches Yielded's default proof lifetime and resend cooldown. */
const codeLifetime = Duration.minutes(5)
const resendCooldown = Duration.seconds(30)

// The link opens in a new tab, so the pending code must outlive this one.
const pendingCodeStorageKey = "gororobas.pending-code"
const PendingCodeJson = Schema.fromJsonString(PendingCode)

const savePendingCode = (pending: PendingCode) =>
  Effect.try(() =>
    localStorage.setItem(pendingCodeStorageKey, Schema.encodeSync(PendingCodeJson)(pending)),
  )

const clearPendingCode = Effect.try(() => localStorage.removeItem(pendingCodeStorageKey)).pipe(
  Effect.ignore,
)

const readPendingCode = Effect.gen(function* () {
  const stored = yield* Effect.try(() => localStorage.getItem(pendingCodeStorageKey))
  if (stored === null) return Option.none()
  const pending = yield* Schema.decodeEffect(PendingCodeJson)(stored)
  const now = yield* Clock.currentTimeMillis
  return pending.sentAt + Duration.toMillis(codeLifetime) > now
    ? Option.some(pending)
    : Option.none()
}).pipe(Effect.orElseSucceed(() => Option.none<PendingCode>()))

/** Emailed links carry the code in the fragment, which never reaches a server. */
const takeLinkCode = Effect.sync(() => {
  const code = /^#code=(\d{6})$/.exec(window.location.hash)?.[1]
  if (window.location.hash !== "") {
    history.replaceState(history.state, "", window.location.pathname + window.location.search)
  }
  return Option.fromNullishOr(code)
})

const isResendAllowed = (pending: PendingCode) =>
  Effect.map(
    Clock.currentTimeMillis,
    (now) => now - pending.sentAt >= Duration.toMillis(resendCooldown),
  )

const fetchProfileName = Effect.gen(function* () {
  const client = yield* GororobasApiClient
  const profile = yield* client.people.getMyProfile()
  return profile === null ? null : profile.name
})

const requestCode = Effect.fn(function* (flowId: Operations.RequestBindingFlowId, email: string) {
  const { auth } = yield* AuthenticationClient

  const receipt = yield* auth.requestEmailCode({
    flowId,
    email,
    returnTarget: DEFAULT_AUTHENTICATION_RETURN_TARGET,
    requestId: Proofs.ProofRequestId.make(crypto.randomUUID()),
    locale: navigator.language || "pt-BR",
  })

  const pending = PendingCode.make({
    flowId,
    email: EmailCodeRequest.fields.email.make(email),
    reference: receipt.reference,
    sentAt: yield* Clock.currentTimeMillis,
  })

  yield* savePendingCode(pending)
  return pending
})

const startFlow = Effect.fn(function* (email: string) {
  const { auth } = yield* AuthenticationClient
  const flowId = Operations.RequestBindingFlowId.make(crypto.randomUUID())
  yield* auth.beginEmailSignIn({ flowId })
  return yield* requestCode(flowId, email)
})

const signInWithCode = Effect.fn(function* (pending: PendingCode, code: string) {
  const { auth } = yield* AuthenticationClient

  const result = yield* auth.completeEmailSignIn({
    flowId: pending.flowId,
    email: pending.email,
    returnTarget: DEFAULT_AUTHENTICATION_RETURN_TARGET,
    reference: pending.reference,
    secret: code,
  })

  if (result.completion._tag !== "Authenticated") return yield* Effect.fail("incomplete")
  yield* clearPendingCode
  return yield* fetchProfileName
})

const genericError = "Something went wrong. Please try again."

export const RestoreSession = Command.define("RestoreSession", {
  messages: [Message.CompletedRestoreSession],
  execute: Effect.gen(function* () {
    const linkCode = yield* takeLinkCode
    const pending = yield* readPendingCode

    if (Option.isSome(linkCode)) {
      if (Option.isNone(pending)) return RestoredSession.FailedLink()
      return yield* signInWithCode(pending.value, linkCode.value).pipe(
        Effect.map((name) => RestoredSession.SignedIn({ name })),
        Effect.orElseSucceed(() => RestoredSession.FailedLink()),
      )
    }

    const { auth } = yield* AuthenticationClient
    if ((yield* auth.getSession()) !== null) {
      return RestoredSession.SignedIn({ name: yield* fetchProfileName })
    }

    return yield* Option.match(pending, {
      onNone: () => Effect.succeed(RestoredSession.SignedOut()),
      onSome: (value) =>
        Effect.map(isResendAllowed(value), (canResend) =>
          RestoredSession.AwaitingCode({ pending: value, canResend }),
        ),
    })
  }).pipe(
    Effect.orElseSucceed(() => RestoredSession.SignedOut()),
    Effect.map((session) => Message.CompletedRestoreSession({ session })),
  ),
})

const SendCode = Command.define("SendCode", {
  args: { email: Schema.String },
  messages: [Message.SucceededSendCode, Message.FailedSendCode],
  execute: ({ email }) =>
    startFlow(email.trim().toLowerCase()).pipe(
      Effect.map((pending) => Message.SucceededSendCode({ pending })),
      Effect.orElseSucceed(() =>
        Message.FailedSendCode({
          error: "We couldn't send the email. Check the address and try again.",
        }),
      ),
    ),
})

const ResendCode = Command.define("ResendCode", {
  args: { pending: PendingCode },
  messages: [Message.SucceededResendCode, Message.FailedResendCode],
  execute: ({ pending }) =>
    // Resending within the same flow keeps the request binding; once it expires, start over.
    requestCode(pending.flowId, pending.email).pipe(
      Effect.catch(() => startFlow(pending.email)),
      Effect.map((next) => Message.SucceededResendCode({ pending: next })),
      Effect.orElseSucceed(() => Message.FailedResendCode({ error: genericError })),
    ),
})

const WaitForResendCooldown = Command.define("WaitForResendCooldown", {
  args: { sentAt: Schema.Number },
  messages: [Message.CompletedWaitForResendCooldown],
  execute: ({ sentAt }) =>
    Effect.sleep(resendCooldown).pipe(
      Effect.as(Message.CompletedWaitForResendCooldown({ sentAt })),
    ),
})

const VerifyCode = Command.define("VerifyCode", {
  args: { pending: PendingCode, code: Schema.String },
  messages: [Message.SucceededVerifyCode, Message.FailedVerifyCode],
  execute: ({ pending, code }) =>
    signInWithCode(pending, code).pipe(
      Effect.map((name) => Message.SucceededVerifyCode({ name })),
      Effect.orElseSucceed(() =>
        Message.FailedVerifyCode({
          error: "That code didn't work. Check it, or resend the email for a new one.",
        }),
      ),
    ),
})

const CompleteOnboarding = Command.define("CompleteOnboarding", {
  args: { name: Schema.String },
  messages: [Message.SucceededCompleteOnboarding, Message.FailedCompleteOnboarding],
  execute: ({ name }) =>
    Effect.gen(function* () {
      const payload = yield* Schema.decodeEffect(OnboardingInput)({ name })
      const client = yield* GororobasApiClient
      const profile = yield* client.people.completeOnboarding({ payload })
      return Message.SucceededCompleteOnboarding({ name: profile.name })
    }).pipe(Effect.orElseSucceed(() => Message.FailedCompleteOnboarding({ error: genericError }))),
})

const SignOut = Command.define("SignOut", {
  messages: [Message.SucceededSignOut, Message.FailedSignOut],
  execute: Effect.flatMap(AuthenticationClient, ({ auth }) => auth.signOut()).pipe(
    Effect.as(Message.SucceededSignOut()),
    Effect.orElseSucceed(() => Message.FailedSignOut()),
  ),
})

// UPDATE

const sentCode = (pending: PendingCode, notice?: string) => ({
  model: {
    stage: awaitingCode({ pending, canResend: false, ...(notice === undefined ? {} : { notice }) }),
  },
  commands: [WaitForResendCooldown({ sentAt: pending.sentAt })],
})

export const update = (
  model: Model,
  message: Message,
): Update.Return<Model, Message, Layer.Success<typeof resources> | GororobasApiClient> => {
  const { stage } = model

  return Message.match(message, {
    UpdatedEmail: ({ value }) =>
      Predicate.isTagged(stage, "EnteringEmail")
        ? { model: { stage: { ...stage, email: value } } }
        : { model },
    SubmittedEmail: () =>
      Predicate.isTagged(stage, "EnteringEmail") && !stage.isSending
        ? {
            model: { stage: { ...stage, isSending: true, error: null } },
            commands: [SendCode({ email: stage.email })],
          }
        : { model },
    ClickedEnterCode: () =>
      Predicate.isTagged(stage, "AwaitingCode")
        ? { model: { stage: { ...stage, isEnteringCode: true, notice: null } } }
        : { model },
    UpdatedCode: ({ value }) =>
      Predicate.isTagged(stage, "AwaitingCode")
        ? { model: { stage: { ...stage, code: value.replace(/\D/g, "").slice(0, 6) } } }
        : { model },
    SubmittedCode: () =>
      Predicate.isTagged(stage, "AwaitingCode") && !stage.isBusy && stage.code.length === 6
        ? {
            model: { stage: { ...stage, isBusy: true, notice: null } },
            commands: [VerifyCode({ pending: stage.pending, code: stage.code })],
          }
        : { model },
    ClickedResend: () =>
      Predicate.isTagged(stage, "AwaitingCode") && !stage.isBusy && stage.canResend
        ? {
            model: { stage: { ...stage, isBusy: true, notice: null } },
            commands: [ResendCode({ pending: stage.pending })],
          }
        : { model },
    ClickedUseDifferentEmail: () =>
      Predicate.isTagged(stage, "AwaitingCode")
        ? { model: { stage: enteringEmail(stage.pending.email) } }
        : { model },
    UpdatedName: ({ value }) =>
      Predicate.isTagged(stage, "Onboarding")
        ? { model: { stage: { ...stage, name: value } } }
        : { model },
    SubmittedName: () =>
      Predicate.isTagged(stage, "Onboarding") && !stage.isSaving
        ? {
            model: { stage: { ...stage, isSaving: true, error: null } },
            commands: [CompleteOnboarding({ name: stage.name })],
          }
        : { model },
    ClickedSignOut: () =>
      Predicate.isTagged(stage, "SignedIn") && !stage.isSigningOut
        ? { model: { stage: { ...stage, isSigningOut: true } }, commands: [SignOut()] }
        : { model },
    CompletedRestoreSession: ({ session }) =>
      RestoredSession.match(session, {
        SignedOut: () => ({ model: { stage: enteringEmail() } }),
        AwaitingCode: ({ pending, canResend }) =>
          canResend
            ? { model: { stage: awaitingCode({ pending, canResend }) } }
            : sentCode(pending),
        SignedIn: ({ name }) => ({ model: { stage: signedIn(name) } }),
        FailedLink: () => ({
          model: {
            stage: enteringEmail(
              "",
              "That link didn't work. It may have expired or been opened in a different browser. Enter your email to get a new one.",
            ),
          },
        }),
      }),
    SucceededSendCode: ({ pending }) => sentCode(pending),
    FailedSendCode: ({ error }) =>
      Predicate.isTagged(stage, "EnteringEmail")
        ? { model: { stage: { ...stage, isSending: false, error } } }
        : { model },
    SucceededResendCode: ({ pending }) =>
      Predicate.isTagged(stage, "AwaitingCode")
        ? sentCode(pending, "We sent a new email. Earlier codes no longer work.")
        : { model },
    FailedResendCode: ({ error }) =>
      Predicate.isTagged(stage, "AwaitingCode")
        ? { model: { stage: { ...stage, isBusy: false, notice: error } } }
        : { model },
    CompletedWaitForResendCooldown: ({ sentAt }) =>
      Predicate.isTagged(stage, "AwaitingCode") && stage.pending.sentAt === sentAt
        ? { model: { stage: { ...stage, canResend: true } } }
        : { model },
    SucceededVerifyCode: ({ name }) => ({ model: { stage: signedIn(name) } }),
    FailedVerifyCode: ({ error }) =>
      Predicate.isTagged(stage, "AwaitingCode")
        ? { model: { stage: { ...stage, isBusy: false, notice: error } } }
        : { model },
    SucceededCompleteOnboarding: ({ name }) => ({ model: { stage: signedIn(name) } }),
    FailedCompleteOnboarding: ({ error }) =>
      Predicate.isTagged(stage, "Onboarding")
        ? { model: { stage: { ...stage, isSaving: false, error } } }
        : { model },
    SucceededSignOut: () => ({ model: { stage: enteringEmail() } }),
    FailedSignOut: () =>
      Predicate.isTagged(stage, "SignedIn")
        ? { model: { stage: { ...stage, isSigningOut: false } } }
        : { model },
  })
}

// VIEW

export const view = defineView<Model, Message>((model: Model, h: HtmlBuilder<Message>) => {
  const status = (text: string | null) =>
    text === null ? [] : [h.p([h.Role("status"), h.Attribute("aria-live", "polite")], [text])]

  return h.main(
    [],
    Stage.match(model.stage, {
      Restoring: () => [h.p([h.Role("status")], ["Checking your session…"])],
      EnteringEmail: ({ email, isSending, error }) => [
        h.h1([], ["Sign in or create your account"]),
        h.form(
          [h.OnSubmit(Message.SubmittedEmail())],
          [
            h.label(
              [],
              [
                "Email ",
                h.input([
                  h.Type("email"),
                  h.Name("email"),
                  h.Required(true),
                  h.Attribute("maxlength", "320"),
                  h.Attribute("autocomplete", "email"),
                  h.Value(email),
                  h.OnInput((value) => Message.UpdatedEmail({ value })),
                ]),
              ],
            ),
            h.button(
              [h.Type("submit"), h.Disabled(isSending)],
              [isSending ? "Sending…" : "Continue with email"],
            ),
          ],
        ),
        ...status(error),
      ],
      AwaitingCode: ({ pending, isEnteringCode, code, isBusy, canResend, notice }) => [
        h.p([], ["To continue, click the link sent to ", h.strong([], [pending.email])]),
        isEnteringCode
          ? h.form(
              [h.OnSubmit(Message.SubmittedCode())],
              [
                h.label(
                  [],
                  [
                    "Verification code ",
                    h.input([
                      h.Type("text"),
                      h.Name("code"),
                      h.Attribute("inputmode", "numeric"),
                      h.Attribute("autocomplete", "one-time-code"),
                      h.Attribute("pattern", "[0-9]{6}"),
                      h.Attribute("maxlength", "6"),
                      h.Required(true),
                      h.Value(code),
                      h.OnInput((value) => Message.UpdatedCode({ value })),
                    ]),
                  ],
                ),
                h.button(
                  [h.Type("submit"), h.Disabled(isBusy || code.length !== 6)],
                  [isBusy ? "Verifying…" : "Verify"],
                ),
              ],
            )
          : h.button(
              [h.Type("button"), h.OnClick(Message.ClickedEnterCode())],
              ["Enter verification code"],
            ),
        h.button(
          [h.Type("button"), h.Disabled(isBusy || !canResend), h.OnClick(Message.ClickedResend())],
          ["Resend email"],
        ),
        h.button(
          [h.Type("button"), h.Disabled(isBusy), h.OnClick(Message.ClickedUseDifferentEmail())],
          ["Use a different email"],
        ),
        ...status(notice),
      ],
      Onboarding: ({ name, isSaving, error }) => [
        h.h1([], ["Welcome to Gororobas!"]),
        h.form(
          [h.OnSubmit(Message.SubmittedName())],
          [
            h.label(
              [],
              [
                "What should we call you? ",
                h.input([
                  h.Type("text"),
                  h.Name("name"),
                  h.Required(true),
                  h.Attribute("maxlength", "128"),
                  h.Attribute("autocomplete", "name"),
                  h.Value(name),
                  h.OnInput((value) => Message.UpdatedName({ value })),
                ]),
              ],
            ),
            h.button(
              [h.Type("submit"), h.Disabled(isSaving || name.trim() === "")],
              [isSaving ? "Saving…" : "Continue"],
            ),
          ],
        ),
        ...status(error),
      ],
      SignedIn: ({ name, isSigningOut }) => [
        h.p([], ["Signed in as ", h.strong([], [name])]),
        h.button([h.Disabled(isSigningOut), h.OnClick(Message.ClickedSignOut())], ["Sign out"]),
      ],
    }),
  )
})
