import {
  EmailCodeRequest,
  DEFAULT_AUTHENTICATION_RETURN_TARGET,
} from "@gororobas/domain/authentication/auth-contract"
import { OnboardingInput } from "@gororobas/domain/people/domain"
import { Operations, Proofs } from "@yielded/auth"
import { Clock, Duration, Effect, Layer, Option, Schema } from "effect"

import { GororobasApiClient } from "../../api-client"
import { AuthenticationClient, SessionAccess, SessionStorageError } from "../../session-access"
import { AuthenticationDefinition } from "./definition"
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
  yield* (yield* SessionAccess).flushSignOut
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
  yield* (yield* SessionAccess).remember({
    subjectId: result.completion.session.subjectId,
    name: null,
  })
  return yield* fetchProfileName.pipe(Effect.orElseSucceed(() => null))
})

const genericError = "Algo deu errado. Tente novamente."

export const RestoreSession = AuthenticationDefinition.makeCommand("RestoreSession", {
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

export const SendCode = AuthenticationDefinition.makeCommand("SendCode", {
  args: { email: Schema.String },
  messages: [Message.SucceededSendCode, Message.FailedSendCode],
  handler: function* () {
    return ({ email }) =>
      startFlow(email.trim().toLowerCase()).pipe(
        Effect.map((pending) => Message.SucceededSendCode({ pending })),
        Effect.orElseSucceed(() =>
          Message.FailedSendCode({
            error: "Não conseguimos enviar o email. Confira o endereço e tente novamente.",
          }),
        ),
      )
  },
})

export const ResendCode = AuthenticationDefinition.makeCommand("ResendCode", {
  args: { pending: PendingCode },
  messages: [Message.SucceededResendCode, Message.FailedResendCode],
  handler: function* () {
    return ({ pending }) =>
      // Resending within the same flow keeps the request binding; once it expires, start over.
      requestCode(pending.flowId, pending.email).pipe(
        Effect.catch(() => startFlow(pending.email)),
        Effect.map((next) => Message.SucceededResendCode({ pending: next })),
        Effect.orElseSucceed(() => Message.FailedResendCode({ error: genericError })),
      )
  },
})

export const WaitForResendCooldown = AuthenticationDefinition.makeCommand("WaitForResendCooldown", {
  args: { sentAt: Schema.Finite },
  messages: [Message.CompletedWaitForResendCooldown],
  handler: function* () {
    return ({ sentAt }) =>
      Effect.sleep(resendCooldown).pipe(
        Effect.as(Message.CompletedWaitForResendCooldown({ sentAt })),
      )
  },
})

export const VerifyCode = AuthenticationDefinition.makeCommand("VerifyCode", {
  args: { pending: PendingCode, code: Schema.String },
  messages: [Message.SucceededVerifyCode, Message.FailedVerifyCode],
  handler: function* () {
    return ({ pending, code }) =>
      signInWithCode(pending, code).pipe(
        Effect.map((name) => Message.SucceededVerifyCode({ name })),
        Effect.orElseSucceed(() =>
          Message.FailedVerifyCode({
            error: "Esse código não funcionou. Confira ou reenvie o email para receber outro.",
          }),
        ),
      )
  },
})

export const CompleteOnboarding = AuthenticationDefinition.makeCommand("CompleteOnboarding", {
  args: { name: Schema.String },
  messages: [Message.SucceededCompleteOnboarding, Message.FailedCompleteOnboarding],
  handler: function* () {
    return ({ name }) =>
      Effect.gen(function* () {
        const payload = yield* Schema.decodeEffect(OnboardingInput)({ name })
        const client = yield* GororobasApiClient
        const profile = yield* client.people.completeOnboarding({ payload })
        yield* (yield* SessionAccess).setName(profile.name)
        return Message.SucceededCompleteOnboarding({ name: profile.name })
      }).pipe(Effect.orElseSucceed(() => Message.FailedCompleteOnboarding({ error: genericError })))
  },
})

export const SignOut = AuthenticationDefinition.makeCommand("SignOut", {
  messages: [Message.SucceededSignOut, Message.FailedSignOut],
  handler: function* () {
    return () =>
      Effect.flatMap(SessionAccess, (access) => access.signOut).pipe(
        Effect.as(Message.SucceededSignOut()),
      )
  },
})

export const CheckConnection = AuthenticationDefinition.makeCommand("CheckConnection", {
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

export const CommandsLayer = Layer.mergeAll(
  RestoreSession.layer,
  SendCode.layer,
  ResendCode.layer,
  WaitForResendCooldown.layer,
  VerifyCode.layer,
  CompleteOnboarding.layer,
  SignOut.layer,
  CheckConnection.layer,
)
