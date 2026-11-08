import {
  EmailCodeRequest,
  DEFAULT_AUTHENTICATION_RETURN_TARGET,
} from "@gororobas/domain/authentication/auth-contract"
import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { OnboardingInput } from "@gororobas/domain/people/domain"
import { Operations, Proofs } from "@yielded/auth"
import { Clock, Duration, Effect, Layer, Option, Schema } from "effect"
import * as Dom from "foldkit/dom"

import { GororobasApiClient } from "../../api-client"
import { AuthenticationClient, SessionAccess, SessionStorageError } from "../../session-access"
import { AuthenticationBlock } from "./definition"
import { Message, RestoredSession } from "./message"
import { PendingCode } from "./model"

/** Matches Yielded's default proof lifetime and resend cooldown. */
const codeLifetime = Duration.minutes(5)
export const resendCooldown = Duration.seconds(30)

// The link opens in a new tab, so the pending code must outlive this one.
const pendingCodeStorageKey = "gororobas.pending-code"
const PendingCodeJson = Schema.fromJsonString(PendingCode)

const savePendingCode = (pending: PendingCode) =>
  Schema.encodeEffect(PendingCodeJson)(pending).pipe(
    Effect.flatMap((encoded) =>
      Effect.try({
        try: () => localStorage.setItem(pendingCodeStorageKey, encoded),
        catch: (cause) => new SessionStorageError({ cause }),
      }),
    ),
  )

const clearPendingCode = Effect.try({
  try: () => localStorage.removeItem(pendingCodeStorageKey),
  catch: (cause) => new SessionStorageError({ cause }),
}).pipe(Effect.ignore)

const readPendingCode = Effect.gen(function* () {
  const stored = yield* Effect.try({
    try: () => localStorage.getItem(pendingCodeStorageKey),
    catch: (cause) => new SessionStorageError({ cause }),
  })
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
  const name = profile === null ? null : profile.name
  yield* (yield* SessionAccess).setName(name)
  return name
})

export const EMAIL_FIELD_ID = "authentication-email"
export const CODE_FIELD_ID = "authentication-code"
export const NAME_FIELD_ID = "authentication-name"

const requestCode = Effect.fn(function* ({
  flowId,
  email,
  language,
}: Readonly<{
  flowId: Operations.RequestBindingFlowId
  email: string
  language: SupportedLanguage
}>) {
  const { auth } = yield* AuthenticationClient

  const receipt = yield* auth.requestEmailCode({
    flowId,
    email,
    returnTarget: DEFAULT_AUTHENTICATION_RETURN_TARGET,
    requestId: Proofs.ProofRequestId.make(crypto.randomUUID()),
    locale: language,
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

const startFlow = Effect.fn(function* (email: string, language: SupportedLanguage) {
  const { auth } = yield* AuthenticationClient
  yield* (yield* SessionAccess).flushSignOut
  const flowId = Operations.RequestBindingFlowId.make(crypto.randomUUID())
  yield* auth.beginEmailSignIn({ flowId })
  return yield* requestCode({ flowId, email, language })
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
  yield* (yield* SessionAccess).remember({
    subjectId: result.completion.session.subjectId,
    name: null,
  })
  return yield* fetchProfileName.pipe(Effect.orElseSucceed(() => null))
})

const genericError = "SomethingWentWrong" as const

export const RestoreSession = AuthenticationBlock.makeCommand("RestoreSession", {
  messages: [Message.CompletedRestoreSession],
  handler: function* () {
    return () =>
      Effect.gen(function* () {
        const linkCode = yield* takeLinkCode
        const pending = yield* readPendingCode

        if (Option.isSome(linkCode)) {
          if (Option.isNone(pending)) return RestoredSession.FailedLink()

          return yield* signInWithCode(pending.value, linkCode.value).pipe(
            Effect.map((name) => RestoredSession.SignedIn({ name, connection: "Ready" })),
            Effect.orElseSucceed(() => RestoredSession.FailedLink()),
          )
        }

        const access = yield* SessionAccess
        const cached = access.read().identity
        if (cached !== null) {
          return RestoredSession.SignedIn({ name: cached.name, connection: "Checking" })
        }
        yield* access.ensureReady(undefined, true).pipe(Effect.ignore)
        const { identity, status } = access.read()

        if (identity !== null) {
          const name =
            status === "Ready"
              ? yield* fetchProfileName.pipe(Effect.orElseSucceed(() => identity.name))
              : identity.name

          if (access.read().identity === null) return RestoredSession.SignedOut()
          return RestoredSession.SignedIn({ name, connection: access.read().status })
        }

        return yield* Option.match(pending, {
          onNone: () => Effect.succeed(RestoredSession.SignedOut()),
          onSome: (value) =>
            Effect.map(isResendAllowed(value), (canResend) =>
              RestoredSession.AwaitingCode({ pending: value, canResend }),
            ),
        })
      }).pipe(Effect.map((session) => Message.CompletedRestoreSession({ session })))
  },
})

export const SendCode = AuthenticationBlock.makeCommand("SendCode", {
  args: { email: Schema.String, language: SupportedLanguage },
  messages: [Message.SucceededSendCode, Message.FailedSendCode],
  handler: function* () {
    return ({ email, language }) =>
      startFlow(email.trim().toLowerCase(), language).pipe(
        Effect.map((pending) => Message.SucceededSendCode({ pending })),
        Effect.orElseSucceed(() =>
          Message.FailedSendCode({
            error: "SendFailed",
          }),
        ),
      )
  },
})

export const ResendCode = AuthenticationBlock.makeCommand("ResendCode", {
  args: { pending: PendingCode, language: SupportedLanguage },
  messages: [Message.SucceededResendCode, Message.FailedResendCode],
  handler: function* () {
    return ({ pending, language }) =>
      // Resending within the same flow keeps the request binding; once it expires, start over.
      requestCode({ flowId: pending.flowId, email: pending.email, language }).pipe(
        Effect.catch(() => startFlow(pending.email, language)),
        Effect.map((next) => Message.SucceededResendCode({ pending: next })),
        Effect.orElseSucceed(() => Message.FailedResendCode({ error: genericError })),
      )
  },
})

export const WaitForResendCooldown = AuthenticationBlock.makeCommand("WaitForResendCooldown", {
  args: { sentAt: Schema.Finite },
  messages: [Message.CompletedWaitForResendCooldown],
  handler: function* () {
    return ({ sentAt }) =>
      Effect.sleep(resendCooldown).pipe(
        Effect.as(Message.CompletedWaitForResendCooldown({ sentAt })),
      )
  },
})

export const VerifyCode = AuthenticationBlock.makeCommand("VerifyCode", {
  args: { pending: PendingCode, code: Schema.String },
  messages: [Message.SucceededVerifyCode, Message.FailedVerifyCode],
  handler: function* () {
    return ({ pending, code }) =>
      signInWithCode(pending, code).pipe(
        Effect.map((name) => Message.SucceededVerifyCode({ name })),
        Effect.orElseSucceed(() =>
          Message.FailedVerifyCode({
            error: "CodeFailed",
          }),
        ),
      )
  },
})

export const CompleteOnboarding = AuthenticationBlock.makeCommand("CompleteOnboarding", {
  args: { name: Schema.String, language: SupportedLanguage },
  messages: [Message.SucceededCompleteOnboarding, Message.FailedCompleteOnboarding],
  handler: function* () {
    return ({ name, language }) =>
      Effect.gen(function* () {
        const payload = yield* Schema.decodeEffect(OnboardingInput)({
          name,
          preferredLanguage: language,
        })
        const client = yield* GororobasApiClient
        const profile = yield* client.people.completeOnboarding({ payload })
        yield* (yield* SessionAccess).setName(profile.name)
        return Message.SucceededCompleteOnboarding({ name: profile.name })
      }).pipe(Effect.orElseSucceed(() => Message.FailedCompleteOnboarding({ error: genericError })))
  },
})

export const SignOut = AuthenticationBlock.makeCommand("SignOut", {
  messages: [Message.SucceededSignOut, Message.FailedSignOut],
  handler: function* () {
    return () =>
      Effect.flatMap(SessionAccess, (access) => access.signOut).pipe(
        Effect.as(Message.SucceededSignOut()),
      )
  },
})

export const CheckConnection = AuthenticationBlock.makeCommand("CheckConnection", {
  messages: [Message.ChangedSessionAccess],
  handler: function* () {
    return () =>
      Effect.gen(function* () {
        const access = yield* SessionAccess
        yield* access.connectionChanged
        yield* access.ensureReady(undefined, true).pipe(Effect.ignore)
        if (access.read().status === "Ready") yield* fetchProfileName.pipe(Effect.ignore)
        return Message.ChangedSessionAccess({ state: access.read() })
      })
  },
})

/** Moves focus to where the next step happens, such as the code field once the email is sent. */
export const FocusField = AuthenticationBlock.makeCommand("FocusField", {
  args: { id: Schema.String },
  messages: [Message.CompletedFocusField],
  handler: function* () {
    return ({ id }) =>
      // The field only exists while the sign-in page shows that step.
      Dom.focus(`#${CSS.escape(id)}`).pipe(
        Effect.catchTag("ElementNotFound", () => Effect.void),
        Effect.as(Message.CompletedFocusField()),
      )
  },
})

/** Loads the page again, so nothing loaded for the previous account stays on screen. */
export const ReloadPage = AuthenticationBlock.makeCommand("ReloadPage", {
  messages: [Message.CompletedReloadPage],
  handler: function* () {
    return () =>
      Effect.sync(() => window.location.reload()).pipe(Effect.as(Message.CompletedReloadPage()))
  },
})

export const CommandsLayer = Layer.mergeAll(
  FocusField.layer,
  RestoreSession.layer,
  SendCode.layer,
  ResendCode.layer,
  WaitForResendCooldown.layer,
  VerifyCode.layer,
  CompleteOnboarding.layer,
  SignOut.layer,
  CheckConnection.layer,
  ReloadPage.layer,
)
