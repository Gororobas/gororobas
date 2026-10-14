import { Context, type Effect } from "effect";

import type { AuthInvocation } from "../operations/context";
import type { OAuthAccountRevision } from "./accountsModels";
import type {
  OAuthConnectedGrantSnapshot,
  OAuthConnectedUseAuthorization,
  OAuthGrantId,
  OAuthPermissionProfileKey,
} from "./connectedModels";
import type { OAuthRejected, OAuthUnavailable } from "./signInErrors";
import type { OAuthModuleId } from "./signInModels";

/** Application policy runs before any token is opened. Token use receives the
 * detached, frozen authority/grant snapshot already read by core; a captured
 * policyRevision binds the returned authorization. Metadata policy obtains its
 * own authority as needed. Mutations recheck captured revisions,
 * current policy and the fixed horizon. A snapshot cannot strengthen independent
 * application policy consistency beyond its own validity. */
export class OAuthConnectedUseAuthority extends Context.Service<
  OAuthConnectedUseAuthority,
  {
    readonly authorize: (
      input: {
        readonly invocation: AuthInvocation;
        readonly moduleId: typeof OAuthModuleId.Type;
      } & (
        | {
            readonly purpose: "metadata";
            readonly grantId?: typeof OAuthGrantId.Type;
            readonly profileKey?: typeof OAuthPermissionProfileKey.Type;
          }
        | {
            readonly purpose: "use";
            readonly grantId: typeof OAuthGrantId.Type;
            readonly profileKey: typeof OAuthPermissionProfileKey.Type;
            readonly captured: {
              readonly revision: OAuthAccountRevision;
              readonly grant: OAuthConnectedGrantSnapshot;
              readonly policyRevision?: OAuthConnectedUseAuthorization["policyRevision"];
            };
          }
      ),
    ) => Effect.Effect<OAuthConnectedUseAuthorization, OAuthRejected | OAuthUnavailable>;
  }
>()("effect-auth/OAuthConnectedUseAuthority") {}
