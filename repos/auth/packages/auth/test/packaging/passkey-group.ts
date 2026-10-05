import { PasskeyContract } from "@yielded/auth/contracts";
import { Passkey } from "@yielded/auth/strategies";

export const contract = PasskeyContract.make;
export const strategy = Passkey.make;
