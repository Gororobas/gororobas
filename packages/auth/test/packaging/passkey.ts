import * as Passkey from "@yielded/auth/Passkey";
import * as PasskeyContract from "@yielded/auth/PasskeyContract";

export const contract = PasskeyContract.make;
export const strategy = Passkey.make;
