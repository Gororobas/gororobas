import {
  type PasskeyAuthenticationStarted,
  type PasskeyRegistrationStarted,
} from "@yielded/auth/Passkey";
import { Context, type Effect } from "effect";

import type {
  PasskeyBrowserAuthentication,
  PasskeyBrowserCapabilities,
  PasskeyBrowserFailure,
  PasskeyBrowserRegistration,
  PasskeyBrowserUnavailable,
} from "./models";

/** Client-local ceremony capability. The caller owns Begin/Complete RPCs and
 * request binding. Interrupt its Effect to request cancellation; no global cancel. */
export class PasskeyBrowser extends Context.Service<
  PasskeyBrowser,
  {
    readonly capabilities: Effect.Effect<PasskeyBrowserCapabilities, PasskeyBrowserUnavailable>;
    readonly register: (
      started: typeof PasskeyRegistrationStarted.Type,
    ) => Effect.Effect<PasskeyBrowserRegistration, PasskeyBrowserFailure>;
    readonly authenticate: (input: {
      readonly started: typeof PasskeyAuthenticationStarted.Type;
      readonly mediation: "required" | "conditional";
    }) => Effect.Effect<PasskeyBrowserAuthentication, PasskeyBrowserFailure>;
  }
>()("effect-auth/PasskeyBrowser") {}
