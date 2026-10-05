import { Context, type Effect } from "effect";

import type { PasskeyUnavailable } from "./errors";
import type { PasskeyCredential, PasskeyProtocolCredentialId } from "./models";

/** Minimum read capability. The tuple is RP-global across module/profile aliases;
 * protocol ID and opaque handle never become application subject identifiers. */
export class PasskeyCredentials extends Context.Service<
  PasskeyCredentials,
  {
    readonly lookup: (input: {
      readonly rpId: string;
      readonly protocolCredentialId: PasskeyProtocolCredentialId;
    }) => Effect.Effect<PasskeyCredential | undefined, PasskeyUnavailable>;
  }
>()("effect-auth/PasskeyCredentials") {}
