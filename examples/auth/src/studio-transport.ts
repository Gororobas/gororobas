import {
  OperationHttp as Http,
  Operations,
  PasskeyContract,
  Schema as AuthSchema,
  SessionContract,
  TotpContract,
} from "@yielded/auth";
import { Schema } from "effect";

import { StudioClaims, registrationSchema } from "./studio-models";
export const sessions = SessionContract.makeSessionContract("studio/Auth/sessions", StudioClaims);

/** An independently contributed feature, using the same authorization boundary. */
export const MemberProfile = Operations.makeOperation("studio/member-profile", {
  payload: Schema.Void,
  success: Schema.Struct({
    memberId: AuthSchema.SubjectId,
    organization: Schema.NonEmptyString,
    name: Schema.NonEmptyString,
  }),
  error: Schema.Never,
  access: "authenticated",
  exposure: "public",
  replay: "read-only",
});

const modules = {
  passkey: PasskeyContract.make("studio/passkey", sessions),
  registration: PasskeyContract.makeRegistration("studio/passkey", registrationSchema),
  keys: PasskeyContract.makeManagement("studio/passkey"),
  authenticator: TotpContract.make("studio/totp", sessions),
};

export const transport = Http.make({
  register: Http.route(modules.registration.operations.Begin, { path: "/auth/register" }),
  completeRegistration: Http.route(modules.registration.operations.Complete, {
    path: "/auth/register/complete",
    credentials: { bindingCredential: "request-binding" },
  }),
  signIn: Http.route(modules.passkey.operations.Begin, { path: "/auth/sign-in" }),
  completeSignIn: Http.route(modules.passkey.operations.Complete, {
    path: "/auth/sign-in/complete",
    credentials: { bindingCredential: "request-binding" },
  }),
  enrollKey: Http.route(modules.keys.operations.Begin, {
    path: "/auth/keys/enroll",
    credentials: { actionProof: "session" },
  }),
  completeKey: Http.route(modules.keys.operations.Complete, {
    path: "/auth/keys/complete",
    credentials: { bindingCredential: "request-binding" },
  }),
  listKeys: Http.route(modules.keys.operations.List, { path: "/auth/keys/list" }),
  renameKey: Http.route(modules.keys.operations.Rename, { path: "/auth/keys/rename" }),
  removeKey: Http.route(modules.keys.operations.Remove, {
    path: "/auth/keys/remove",
    credentials: { actionProof: "session" },
  }),
  beginTotp: Http.route(modules.authenticator.operations.Begin, {
    path: "/auth/totp/enroll",
    credentials: { actionProof: "session" },
    reveals: ["totp-enrollment"],
  }),
  confirmTotp: Http.route(modules.authenticator.operations.Confirm, {
    path: "/auth/totp/confirm",
    credentials: { actionProof: "session" },
    reveals: ["recovery-codes"],
  }),
  disableTotp: Http.route(modules.authenticator.operations.Disable, {
    path: "/auth/totp/disable",
    credentials: { actionProof: "session" },
  }),
  regenerateRecovery: Http.route(modules.authenticator.operations.Regenerate, {
    path: "/auth/totp/recovery",
    credentials: { actionProof: "session" },
    reveals: ["recovery-codes"],
  }),
  verifyTotp: Http.route(modules.authenticator.operations.VerifyPending, {
    path: "/auth/totp/verify",
    credentials: { pendingCredential: "pending-proof" },
  }),
  recoverPending: Http.route(modules.authenticator.operations.RecoverPending, {
    path: "/auth/totp/recover-pending",
    credentials: { pendingCredential: "pending-proof" },
  }),
  verify: Http.route(sessions.operations.Verify, {
    path: "/auth/session",
    allowInternal: true,
    credentials: { credential: "session" },
  }),
  signOut: Http.route(sessions.operations.SignOut, {
    path: "/auth/sign-out",
    allowInternal: true,
    credentials: { credential: "session" },
  }),
  renew: Http.route(sessions.operations.Renew, {
    path: "/auth/renew",
    allowInternal: true,
    credentials: { credential: "session" },
  }),
  capabilities: Http.route(sessions.operations.Capabilities, { path: "/auth/capabilities" }),
  member: Http.route(MemberProfile, { path: "/auth/member" }),
});
