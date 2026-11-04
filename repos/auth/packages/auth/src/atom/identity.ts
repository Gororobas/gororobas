import type * as Layer from "effect/Layer";
import type * as KeyValueStore from "effect/persistence/KeyValueStore";
import * as Schema from "effect/Schema";

import { SubjectId } from "../Schema";

/** A remembered snapshot selects local data. Only a live response can verify it. */
export const makeIdentitySchema = <S extends Schema.Constraint>(snapshot: S) =>
  Schema.Union([
    Schema.TaggedStruct("Unknown", {}),
    Schema.TaggedStruct("Remembered", { subjectId: SubjectId, snapshot }),
    Schema.TaggedStruct("Verified", { subjectId: SubjectId, snapshot }),
    Schema.TaggedStruct("SignedOut", {}),
  ]);

export type AuthIdentity<Session> = ReturnType<
  typeof makeIdentitySchema<Schema.Schema<Session>>
>["Type"];

/** Persist one public session snapshot. Use a separate key per auth server and
 * application. Storage is acquired in the owning registry's Scope. */
export type IdentityCacheOptions<S extends Schema.Constraint, E = never> = {
  readonly key: string;
  /** Provide the store and any services required to encode the public snapshot. */
  readonly storage: Layer.Layer<KeyValueStore.KeyValueStore | S["EncodingServices"], E>;
};

export class IdentityNotVerified extends Schema.TaggedError<
  IdentityNotVerified,
  { readonly brand: unique symbol }
>()("IdentityNotVerified", {
  reason: Schema.Literals(["signed-out", "subject-mismatch", "unavailable"]),
}) {}
