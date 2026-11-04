import * as M from "@yielded/auth/Passkey";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { digest } from "./crypto";

export const passkeyCanonicalJson = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
) => {
  const codec = Schema.fromJsonString(Schema.toCodecJson(Schema.toType(schema)));

  return {
    encode: (value: S["Type"]) => Schema.encodeSync(codec)(M.snapshotPasskeySync(schema, value)),
    decode: (text: unknown): S["Type"] => Schema.decodeUnknownSync(codec)(text),
  };
};

export const passkeyDigest = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  value: S["Type"],
) => digest(passkeyCanonicalJson(schema).encode(value));

export const passkeyEnrollmentDigest = Effect.fnUntraced(function* (ceremony: M.PasskeyCeremony) {
  if (ceremony.context._tag !== "Enrollment") return yield* M.PasskeyUnavailable.make({});

  return yield* passkeyDigest(
    Schema.Tuple([
      M.PasskeyModuleId,
      Schema.Literal("enrollment"),
      Schema.Struct({ ...M.PasskeyBegin.fields, name: M.PasskeyLabel }),
      M.PasskeyProfile,
      M.PasskeyRevision,
      M.PasskeyUserHandle,
      Schema.Array(M.PasskeyDescriptor),
    ]),
    [
      ceremony.moduleId,
      "enrollment",
      {
        flowId: ceremony.flowId,
        commandId: ceremony.commandId,
        profileId: ceremony.profile.profileId,
        name: ceremony.context.name,
      },
      ceremony.profile,
      ceremony.context.revision,
      ceremony.context.userHandle,
      ceremony.allowedCredentials,
    ],
  );
});

export const passkeyRemoveDigest = (
  moduleId: string,
  commandId: string,
  credential: M.PasskeyCredential,
) =>
  passkeyDigest(
    Schema.Tuple([
      M.PasskeyModuleId,
      Schema.Literal("remove"),
      M.PasskeyBegin.fields.commandId,
      M.PasskeyCredential,
    ]),
    [
      M.PasskeyModuleId.make(moduleId),
      "remove",
      M.PasskeyBegin.fields.commandId.make(commandId),
      credential,
    ],
  );
