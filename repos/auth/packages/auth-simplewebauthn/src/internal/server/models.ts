import { PasskeyProfile } from "@yielded/auth/Passkey";
import { Schema } from "effect";

export const SimpleWebAuthnPasskeyProtocolOptions = Schema.Struct({
  profiles: Schema.NonEmptyArray(PasskeyProfile).check(Schema.isMaxLength(64)),
});

export type SimpleWebAuthnPasskeyProtocolOptions = typeof SimpleWebAuthnPasskeyProtocolOptions.Type;
