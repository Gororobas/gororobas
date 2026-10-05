import { Schema } from "effect";

import { LastSignInMethod } from "./identity/models";
import { makeOperation, operationGroup } from "./operations/operation";
import { PasskeyFailure } from "./passkey/errors";
import {
  PasskeyBegin,
  PasskeyComplete,
  PasskeyAuthenticationStarted,
  PasskeyCleanupResult,
  PasskeyRegistrationComplete,
  PasskeyRegistrationStarted,
  PasskeyRegistrationResult,
  PasskeyLabel,
  PasskeyCredentialId,
  PasskeyCredentialSummary,
  PasskeyEnrolled,
  PasskeyRemoved,
} from "./passkey/models";

/** Canonical passkey contracts without a verifier, storage, or authority Layers. */
export const make = <
  const Id extends string,
  Session extends Schema.Codec<unknown, unknown, unknown, unknown>,
  Completion extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  sessions: { readonly Session: Session; readonly CompletionResult: Completion },
) => {
  const Begin = makeOperation(`${moduleId}/passkey/sign-in/begin`, {
    payload: PasskeyBegin,
    success: PasskeyAuthenticationStarted,
    error: PasskeyFailure,
    exposure: "public",
    access: "any",
    replay: "single-use",
    credentials: true,
  });

  const Complete = makeOperation(`${moduleId}/passkey/sign-in/complete`, {
    payload: PasskeyComplete,
    success: sessions.CompletionResult,
    error: PasskeyFailure,
    exposure: "public",
    access: "any",
    replay: "single-use",
    credentials: true,
  });

  const Cleanup = makeOperation(`${moduleId}/passkey/cleanup`, {
    payload: Schema.Struct({
      limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
    }),
    success: PasskeyCleanupResult,
    error: PasskeyFailure,
    access: "system",
    exposure: "internal",
    replay: "non-idempotent",
  });

  const operations = { Begin, Complete, Cleanup };

  return Object.freeze({ operations, group: operationGroup(...Object.values(operations)) });
};

export const makeRegistration = <
  const Id extends string,
  Registration extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  codec: Registration,
) => {
  const RegistrationCodec: Schema.Codec<
    Registration["Type"],
    Registration["Encoded"],
    Registration["DecodingServices"],
    Registration["EncodingServices"]
  > = codec;

  const BeginInput = Schema.Struct({ ...PasskeyBegin.fields, registration: RegistrationCodec });

  const Begin = makeOperation(`${moduleId}/passkey/registration/begin`, {
    payload: BeginInput,
    success: PasskeyRegistrationStarted,
    error: PasskeyFailure,
    exposure: "public",
    access: "any",
    replay: "single-use",
    credentials: true,
  });

  const Complete = makeOperation(`${moduleId}/passkey/registration/complete`, {
    payload: PasskeyRegistrationComplete,
    success: PasskeyRegistrationResult,
    error: PasskeyFailure,
    exposure: "public",
    access: "any",
    replay: "single-use",
    credentials: true,
  });

  const operations = { Begin, Complete };

  return Object.freeze({
    BeginInput,
    RegistrationCodec,
    operations,
    group: operationGroup(Begin, Complete),
  });
};

const proof = Schema.optionalKey(
  Schema.RedactedFromValue(Schema.NonEmptyString.check(Schema.isMaxLength(16384))),
);

const listResult = Schema.Struct({
  credentials: Schema.Array(PasskeyCredentialSummary).check(Schema.isMaxLength(64)),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2048))),
});

export const makeManagement = <const Id extends string>(moduleId: Id) => {
  const BeginInput = Schema.Struct({
    ...PasskeyBegin.fields,
    name: PasskeyLabel,
    actionProof: proof,
  });

  const CompleteInput = Schema.Struct({
    ...PasskeyRegistrationComplete.fields,
    actionProof: proof,
  });

  const ListInput = Schema.Struct({
    cursor: listResult.fields.cursor,
    limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })),
  });

  const RenameInput = Schema.Struct({
    commandId: PasskeyBegin.fields.commandId,
    credentialId: PasskeyCredentialId,
    name: PasskeyLabel,
  });

  const RemoveInput = Schema.Struct({
    commandId: PasskeyBegin.fields.commandId,
    credentialId: PasskeyCredentialId,
    actionProof: proof,
  });

  const Failure = Schema.Union([PasskeyFailure, LastSignInMethod]);

  const Begin = makeOperation(`${moduleId}/passkey/enrollment/begin`, {
    payload: BeginInput,
    success: PasskeyRegistrationStarted,
    error: PasskeyFailure,
    exposure: "public",
    access: "authenticated",
    replay: "single-use",
    credentials: true,
  });

  const Complete = makeOperation(`${moduleId}/passkey/enrollment/complete`, {
    payload: CompleteInput,
    success: PasskeyEnrolled,
    error: PasskeyFailure,
    exposure: "public",
    access: "authenticated",
    replay: "single-use",
    credentials: true,
  });

  const List = makeOperation(`${moduleId}/passkey/list`, {
    payload: ListInput,
    success: listResult,
    error: PasskeyFailure,
    exposure: "public",
    access: "authenticated",
    replay: "read-only",
  });

  const Rename = makeOperation(`${moduleId}/passkey/rename`, {
    payload: RenameInput,
    success: Schema.Struct({ credential: PasskeyCredentialSummary, replayed: Schema.Boolean }),
    error: PasskeyFailure,
    exposure: "public",
    access: "authenticated",
    replay: "idempotent",
  });

  const Remove = makeOperation(`${moduleId}/passkey/remove`, {
    payload: RemoveInput,
    success: PasskeyRemoved,
    error: Failure,
    exposure: "public",
    access: "authenticated",
    replay: "idempotent",
  });

  const operations = { Begin, Complete, List, Rename, Remove };

  return Object.freeze({
    BeginInput,
    CompleteInput,
    ListInput,
    RenameInput,
    RemoveInput,
    Failure,
    listResult,
    operations,
    group: operationGroup(...Object.values(operations)),
  });
};
