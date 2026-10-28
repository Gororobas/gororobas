import { EmailCodeRequest } from "@gororobas/domain/authentication/auth-contract"
import { Operations, Proofs } from "@yielded/auth"
import { Option, Predicate, Schema } from "effect"
import { defineTaggedUnion } from "foldkit/schema"

import { SessionState } from "../../session-access"

/** A requested code. Public: the code itself only exists in the email and in what the person types. */
export const PendingCode = Schema.Struct({
  flowId: Operations.RequestBindingFlowId,
  email: EmailCodeRequest.fields.email,
  reference: Proofs.ProofReference,
  sentAt: Schema.Finite,
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
  SignedIn: {
    name: Schema.String,
    isSigningOut: Schema.Boolean,
    connection: SessionState.fields.status,
  },
})

export type Stage = typeof Stage.Type

export const Model = Schema.Struct({ stage: Stage })
export type Model = typeof Model.Type

export const isSignedIn = (model: Model) =>
  Predicate.isTagged(model.stage, "SignedIn") || Predicate.isTagged(model.stage, "Onboarding")

export const enteringEmail = (email = "", error: string | null = null) =>
  Stage.EnteringEmail({ email, isSending: false, error })

export const awaitingCode = (input: {
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
export const signedIn = (name: string | null, connection: SessionState["status"] = "Ready") =>
  name === null
    ? Stage.Onboarding({ name: "", isSaving: false, error: null })
    : Stage.SignedIn({ name, isSigningOut: false, connection })

/** The signed-in person's profile name, once onboarding gave them one. */
export const viewerName = (model: Model): Option.Option<string> =>
  Predicate.isTagged(model.stage, "SignedIn") ? Option.some(model.stage.name) : Option.none()
