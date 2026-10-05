import type { SubjectId } from "@yielded/auth/Schema";
import type { Effect } from "effect";

import type { PersistenceMappingError } from "../mapping-error";
export type { PersistenceMappingError } from "../mapping-error";

export interface SubjectIdCodec<NativeId> {
  readonly toNative: (id: SubjectId) => Effect.Effect<NativeId, PersistenceMappingError>;
  readonly toSubject: (id: NativeId) => Effect.Effect<SubjectId, PersistenceMappingError>;
  readonly equals: (left: NativeId, right: NativeId) => boolean;
}
