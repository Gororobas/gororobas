import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"

import { SessionState } from "../../session-access"
import { PendingCode } from "./model"

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
  ClickedEnterCode: {},
  UpdatedCode: { value: Schema.String },
  SubmittedCode: {},
  ClickedResend: {},
  ClickedUseDifferentEmail: {},
  UpdatedName: { value: Schema.String },
  SubmittedName: {},
  ClickedSignOut: {},
  RequestedRestoreSession: {},
  CompletedRestoreSession: { session: RestoredSession },
  ChangedSessionAccess: { state: SessionState },
  ChangedConnection: {},
  SucceededSendCode: { pending: PendingCode },
  FailedSendCode: { error: Schema.String },
  SucceededResendCode: { pending: PendingCode },
  FailedResendCode: { error: Schema.String },
  CompletedWaitForResendCooldown: { sentAt: Schema.Finite },
  SucceededVerifyCode: { name: Schema.NullOr(Schema.String) },
  FailedVerifyCode: { error: Schema.String },
  SucceededCompleteOnboarding: { name: Schema.String },
  FailedCompleteOnboarding: { error: Schema.String },
  SucceededSignOut: {},
  FailedSignOut: {},
})
