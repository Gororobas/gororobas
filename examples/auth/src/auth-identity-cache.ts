import { Atom as AuthAtom } from "@yielded/auth";
import type { SubjectId } from "@yielded/auth/Schema";
import { Effect } from "effect";
import { KeyValueStore } from "effect/persistence";

import { AppClient } from "./auth-client";

// One public snapshot per application/auth-server key. Browser storage is acquired lazily.
export const auth = AuthAtom.make(AppClient, {
  identityCache: {
    key: "example:app.example.com:identity:v1",
    storage: KeyValueStore.layerStorage(() => localStorage),
  },
});

// Remembered and Verified carry subjectId + snapshot. Use subjectId to select local data.
export const identity = auth.identity;

// Compose this check before sending an account's queued work. Each server request
// must still authorize the operation, even after this verification succeeds.
export const verifyAccount = auth.runtime.fn<SubjectId>()(
  Effect.fn("example.verifyAccount")(function* (expectedSubjectId, get) {
    return yield* get.result(auth.verifiedSession(expectedSubjectId), {
      suspendOnWaiting: true,
    });
  }),
);
