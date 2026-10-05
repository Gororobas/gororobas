import { Context, type Effect } from "effect";

import type { AuthInvocation } from "../operations/context";
import type {
  OAuthConnectedUseAuthorization,
  OAuthGrantId,
  OAuthPermissionProfileKey,
} from "./connectedModels";
import type { OAuthRejected, OAuthUnavailable } from "./signInErrors";
import type { OAuthModuleId } from "./signInModels";

/** Current application metadata/use authority, not a boolean. Persistence must
 * recheck the captured private revisions, policy and horizon in its final owner.
 * Cross-authority rules cannot promise stronger consistency than their validity. */
export class OAuthConnectedUseAuthority extends Context.Service<
  OAuthConnectedUseAuthority,
  {
    readonly authorize: (input: {
      readonly invocation: AuthInvocation;
      readonly moduleId: typeof OAuthModuleId.Type;
      readonly purpose: "metadata" | "use";
      readonly grantId?: typeof OAuthGrantId.Type;
      readonly profileKey?: typeof OAuthPermissionProfileKey.Type;
    }) => Effect.Effect<OAuthConnectedUseAuthorization, OAuthRejected | OAuthUnavailable>;
  }
>()("effect-auth/OAuthConnectedUseAuthority") {}
