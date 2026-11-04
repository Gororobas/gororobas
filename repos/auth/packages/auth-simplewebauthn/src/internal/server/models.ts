import { PasskeyProfile } from "@yielded/auth/Passkey";
import * as Schema from "effect/Schema";

export const SimpleWebAuthnPasskeyProtocolOptions = Schema.Struct({
  profiles: Schema.NonEmptyArray(PasskeyProfile).check(Schema.isMaxLength(64)),
});

export type SimpleWebAuthnPasskeyProtocolOptions = typeof SimpleWebAuthnPasskeyProtocolOptions.Type;
