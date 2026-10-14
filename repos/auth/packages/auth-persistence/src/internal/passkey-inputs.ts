import * as M from "@yielded/auth/Passkey";
import { CleanupLimit } from "@yielded/auth/Persistence";
import { SubjectId } from "@yielded/auth/Schema";
import { SessionInvalidationWindow } from "@yielded/auth/Sessions";
import { Schema } from "effect";
const metadata = { moduleId: M.PasskeyModuleId, subjectId: SubjectId };

const identity = {
  ...metadata,
  commandId: M.PasskeyCommandId,
  credentialId: M.PasskeyCredentialId,
};

export const passkeyOperationInputs = {
  issue: Schema.Struct({ ceremony: M.PasskeyCeremony }),
  context: M.PasskeyAccess,
  consume: Schema.Struct({
    access: M.PasskeyAccess,
    ceremony: M.PasskeyCeremony,
    credential: M.PasskeyCredential,
    assertion: M.PasskeyAssertionVerified,
  }),
  cleanup: Schema.Struct({
    moduleId: M.PasskeyModuleId,
    limit: CleanupLimit,
  }),
  lookup: Schema.Struct({
    rpId: M.PasskeyProfile.fields.rpId,
    protocolCredentialId: M.PasskeyProtocolCredentialId,
  }),
  listForSubject: Schema.Struct({ ...metadata, rpId: M.PasskeyProfile.fields.rpId }),
};

export const passkeyManagementInputs = {
  list: Schema.Struct({
    ...metadata,
    cursor: Schema.optionalKey(M.PasskeyCredentialId),
    limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })),
  }),
  completeEnrollment: Schema.Struct({
    access: M.PasskeyAccess,
    ceremony: M.PasskeyCeremony,
    verified: M.PasskeyRegistrationVerified,
    management: M.PasskeyManagementPolicy,
  }),
  inspectRemove: Schema.Struct({ ...metadata, credentialId: M.PasskeyCredentialId }),
  rename: Schema.Struct({ ...identity, name: M.PasskeyLabel }),
  remove: Schema.Struct({
    moduleId: M.PasskeyModuleId,
    commandId: M.PasskeyCommandId,
    credential: M.PasskeyCredential,
    authorization: M.PasskeyActionAuthorization,
    management: M.PasskeyManagementPolicy,
    invalidation: SessionInvalidationWindow,
  }),
};
