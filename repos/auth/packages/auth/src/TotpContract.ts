import { Schema } from "effect";

import { makeOperation, operationGroup } from "./operations/operation";
import { TotpFailure } from "./totp/errors";
import {
  TotpId,
  TotpCredential,
  TotpCode,
  TotpRecoveryCode,
  TotpEnrollmentStarted,
  TotpManagementResult,
  TotpRecoveryReset,
} from "./totp/models";

export const actionFields = { commandId: TotpId, actionProof: Schema.optionalKey(TotpCredential) };

export const BeginInput = Schema.Struct({
  ...actionFields,
  accountName: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
});

export const ConfirmInput = Schema.Struct({
  ...actionFields,
  enrollmentId: TotpId,
  code: TotpCode,
});

export const ManageInput = Schema.Struct(actionFields);
export const VerifyInput = Schema.Struct({ pendingCredential: TotpCredential, code: TotpCode });

export const RecoveryInput = Schema.Struct({
  pendingCredential: TotpCredential,
  code: TotpRecoveryCode,
});

export const StepUpInput = Schema.Struct({
  stepUpCredential: TotpCredential,
  sourceCredential: TotpCredential,
  code: TotpCode,
});

/** Canonical TOTP contracts without secret encryption, storage, or authority Layers. */
export const make = <
  const Id extends string,
  Session extends Schema.Codec<unknown, unknown, unknown, unknown>,
  Completion extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  sessions: { readonly Session: Session; readonly CompletionResult: Completion },
) => {
  const Begin = makeOperation(`${moduleId}/totp/enroll`, {
    payload: BeginInput,
    success: TotpEnrollmentStarted,
    error: TotpFailure,
    exposure: "public",
    access: "authenticated",
    replay: "single-use",
    credentials: true,
    reveals: ["totp-enrollment"],
  });

  const Confirm = makeOperation(`${moduleId}/totp/confirm`, {
    payload: ConfirmInput,
    success: TotpManagementResult,
    error: TotpFailure,
    exposure: "public",
    access: "authenticated",
    replay: "single-use",
    credentials: true,
    reveals: ["recovery-codes"],
  });

  const Disable = makeOperation(`${moduleId}/totp/disable`, {
    payload: ManageInput,
    success: TotpManagementResult,
    error: TotpFailure,
    exposure: "public",
    access: "authenticated",
    replay: "single-use",
  });

  const Regenerate = makeOperation(`${moduleId}/totp/recovery/regenerate`, {
    payload: ManageInput,
    success: TotpManagementResult,
    error: TotpFailure,
    exposure: "public",
    access: "authenticated",
    replay: "single-use",
    credentials: true,
    reveals: ["recovery-codes"],
  });

  const VerifyPending = makeOperation(`${moduleId}/totp/pending`, {
    payload: VerifyInput,
    success: sessions.CompletionResult,
    error: TotpFailure,
    exposure: "public",
    access: "any",
    replay: "single-use",
    credentials: true,
  });

  const VerifyStepUp = makeOperation(`${moduleId}/totp/step-up`, {
    payload: StepUpInput,
    success: sessions.Session,
    error: TotpFailure,
    exposure: "public",
    access: "authenticated",
    replay: "single-use",
    credentials: true,
  });

  const RecoverPending = makeOperation(`${moduleId}/totp/recovery/pending`, {
    payload: RecoveryInput,
    success: sessions.CompletionResult,
    error: TotpFailure,
    exposure: "public",
    access: "any",
    replay: "single-use",
    credentials: true,
  });

  const RecoverLostFactor = makeOperation(`${moduleId}/totp/recovery/reset`, {
    payload: RecoveryInput,
    success: TotpRecoveryReset,
    error: TotpFailure,
    exposure: "public",
    access: "any",
    replay: "single-use",
    credentials: true,
  });

  const operations = {
    Begin,
    Confirm,
    Disable,
    Regenerate,
    VerifyPending,
    VerifyStepUp,
    RecoverPending,
    RecoverLostFactor,
  };

  return Object.freeze({ operations, group: operationGroup(...Object.values(operations)) });
};

export { TotpPolicy } from "./totp/models";
