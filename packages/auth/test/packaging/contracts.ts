import * as AuthContract from "@yielded/auth/AuthContract";
import * as PasskeyContract from "@yielded/auth/PasskeyContract";
import * as SessionContract from "@yielded/auth/SessionContract";
import * as TotpContract from "@yielded/auth/TotpContract";

export const makeSessionContract = SessionContract.makeSessionContract;
export const makePasskey = PasskeyContract.make;
export const makeRegistration = PasskeyContract.makeRegistration;
export const makeManagement = PasskeyContract.makeManagement;
export const makeTotp = TotpContract.make;
export const make = AuthContract.make;
export const action = AuthContract.action;
export const fromOperation = AuthContract.fromOperation;
export const passwordSignIn = AuthContract.passwordSignIn;
