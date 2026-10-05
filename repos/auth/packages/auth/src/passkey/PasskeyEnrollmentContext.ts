import { Context, type Effect } from "effect";

import type { SubjectId } from "../Schema";
import type { PasskeyUnavailable } from "./errors";
import type { PasskeyDescriptor, PasskeyRevision, PasskeyUserHandle } from "./models";

/** Current active subject, original revisions and every same-RP exclusion. An
 * absent handle is installed conditionally with issue, never by this read. */
export class PasskeyEnrollmentContext extends Context.Service<
  PasskeyEnrollmentContext,
  {
    readonly capture: (input: {
      readonly moduleId: string;
      readonly rpId: string;
      readonly subjectId: SubjectId;
    }) => Effect.Effect<
      | {
          readonly revision: typeof PasskeyRevision.Type;
          readonly userHandle?: PasskeyUserHandle;
          readonly credentials: ReadonlyArray<typeof PasskeyDescriptor.Type>;
        }
      | undefined,
      PasskeyUnavailable
    >;
  }
>()("effect-auth/PasskeyEnrollmentContext") {}
