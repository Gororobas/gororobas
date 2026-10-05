import * as M from "@yielded/auth/OAuth";
import {
  OAuthConnectedRevocationClaim,
  OAuthClaimId,
  OAuthCleanupInput,
  OAuthCommandId,
  OAuthExternalIdentity,
  OAuthInstant,
  OAuthModuleId,
  snapshotOAuthSync,
} from "@yielded/auth/OAuth";
import { Schema } from "effect";

const capture = Schema.Struct({
  moduleId: OAuthModuleId,
  subjectId: M.OAuthConnectedUseAuthorization.fields.revision.fields.subjectId,
  grantId: Schema.optionalKey(M.OAuthGrantId),
});

const issue = Schema.Struct({
  flow: M.OAuthConnectedPendingFlow,
  authorization: M.OAuthConnectedActionAuthorization,
});

const preparation = Schema.Struct({
  flow: M.OAuthConnectedPendingFlow,
  authorization: M.OAuthConnectedUseAuthorization,
});

const claim = Schema.Struct({
  ...issue.fields,
  access: M.OAuthConnectedAccess,
  claimId: OAuthClaimId,
});

const inspectGrant = Schema.Struct({
  claim: M.OAuthConnectedClaim,
  identity: OAuthExternalIdentity,
});

const settle = Schema.Struct({
  claim: M.OAuthConnectedClaim,
  outcome: M.OAuthConnectedOutcome,
  authorization: M.OAuthConnectedActionAuthorization,
  nowMillis: OAuthInstant,
});

const list = Schema.Struct({
  ...M.OAuthConnectedList.fields,
  authorization: M.OAuthConnectedUseAuthorization,
});

const inspectDisconnect = Schema.Struct({
  moduleId: OAuthModuleId,
  subjectId: capture.fields.subjectId,
  authorization: M.OAuthConnectedUseAuthorization,
  commandId: OAuthCommandId,
  grantId: M.OAuthGrantId,
});

const disconnect = Schema.Struct({
  moduleId: OAuthModuleId,
  commandId: OAuthCommandId,
  grant: M.OAuthConnectedDisconnectGrant,
  authorization: M.OAuthConnectedActionAuthorization,
  revocation: Schema.optionalKey(M.OAuthConnectedRevocationJob),
  retentionUntilMillis: OAuthInstant,
});

const inspectAccess = Schema.Struct({
  authorization: M.OAuthConnectedUseAuthorization,
  ...M.OAuthConnectedUse.fields,
});

const claimRefresh = Schema.Struct({
  grant: M.OAuthConnectedStoredGrant,
  authorization: M.OAuthConnectedUseAuthorization,
  claimId: OAuthClaimId,
  nextTokenVersion: M.OAuthConnectedRefreshClaim.fields.nextTokenVersion,
  lifetimeMillis: M.OAuthConnectedPolicy.fields.refreshClaimLifetimeMillis,
});

const settleRefresh = Schema.Struct({
  claim: M.OAuthConnectedRefreshClaim,
  authorization: M.OAuthConnectedUseAuthorization,
  outcome: M.OAuthConnectedRefreshOutcome,
});

const admitUse = Schema.Struct({
  grant: M.OAuthConnectedStoredGrant,
  authorization: M.OAuthConnectedUseAuthorization,
  admissionId: OAuthClaimId,
  lifetimeMillis: M.OAuthConnectedPolicy.fields.useAdmissionLifetimeMillis,
});

const revocationClaim = Schema.Struct({
  moduleId: OAuthModuleId,
  claimId: OAuthClaimId,
  lifetimeMillis: M.OAuthConnectedPolicy.fields.refreshClaimLifetimeMillis,
});

const revocationSettle = Schema.Struct({
  claim: OAuthConnectedRevocationClaim,
  outcome: Schema.Literals(["Confirmed", "Unknown"]),
});

const snapshot =
  <A, I>(schema: Schema.Codec<A, I, never, never>) =>
  (input: A) =>
    snapshotOAuthSync(schema, input);

export const connectedInputs = {
  claimSignIn: snapshot(
    Schema.Struct({ claim: M.OAuthClaim, configuration: M.OAuthConnectedConfiguration }),
  ),
  inspectSignIn: snapshot(
    Schema.Struct({
      reservation: M.OAuthSignInAccessClaim,
      credential: M.OAuthCredentialSnapshot,
      grantId: M.OAuthGrantId,
    }),
  ),
  settleSignIn: snapshot(
    Schema.Struct({ reservation: M.OAuthSignInAccessClaim, outcome: M.OAuthSignInAccessOutcome }),
  ),
  capture: snapshot(capture),
  issue: snapshot(issue),
  prepare: snapshot(preparation),
  inspectPrepared: snapshot(M.OAuthConnectedPreparedAccess),
  preflight: snapshot(M.OAuthConnectedAccess),
  claim: snapshot(claim),
  inspectGrant: snapshot(inspectGrant),
  settle: snapshot(settle),
  list: snapshot(list),
  inspectDisconnect: snapshot(inspectDisconnect),
  disconnect: snapshot(disconnect),
  inspectAccess: snapshot(inspectAccess),
  claimRefresh: snapshot(claimRefresh),
  settleRefresh: snapshot(settleRefresh),
  admitUse: snapshot(admitUse),
  cleanup: snapshot(OAuthCleanupInput),
};

export const connectedRevocationInputs = {
  claim: snapshot(revocationClaim),
  settle: snapshot(revocationSettle),
};
