import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"

import { SessionState } from "../../session-access"
import { AuthenticationNotice, PendingCode } from "./model"

export const RestoredSession = defineTaggedUnion({
  SignedOut: {},
  AwaitingCode: { pending: PendingCode, canResend: Schema.Boolean },
  SignedIn: { name: Schema.NullOr(Schema.String), connection: SessionState.fields.status },
  /** The emailed link couldn't sign in: expired, already used, or opened in another browser. */
  FailedLink: {},
})

export const Message = defineMessageUnion({
  UpdatedEmail: { value: Schema.String },
  SubmittedEmail: {},
  UpdatedCode: { value: Schema.String },
  SubmittedCode: {},
  ClickedResend: {},
  ClickedUseDifferentEmail: {},
  UpdatedName: { value: Schema.String },
  SubmittedName: {},
  ClickedSignOut: {},
  CompletedRestoreSession: { session: RestoredSession },
  ChangedSessionAccess: { state: SessionState },
  ChangedConnection: {},
  SucceededSendCode: { pending: PendingCode },
  FailedSendCode: { error: AuthenticationNotice },
  SucceededResendCode: { pending: PendingCode },
  FailedResendCode: { error: AuthenticationNotice },
  CompletedWaitForResendCooldown: { sentAt: Schema.Finite },
  SucceededVerifyCode: { name: Schema.NullOr(Schema.String) },
  FailedVerifyCode: { error: AuthenticationNotice },
  SucceededCompleteOnboarding: { name: Schema.String },
  FailedCompleteOnboarding: { error: AuthenticationNotice },
  SucceededSignOut: {},
  FailedSignOut: {},
  CompletedFocusField: {},
})

export const OutMessage = defineMessageUnion({
  /** A new account got its profile: the app takes them to fill in the rest. */
  CompletedOnboarding: {},
})
