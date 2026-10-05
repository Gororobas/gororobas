import { Context, type Redacted } from "effect";

/** Host-verified opaque network identity. Supply per invocation; never accept this in RPC payloads. */
export class PhoneRequestContext extends Context.Service<
  PhoneRequestContext,
  { readonly networkKey: Redacted.Redacted<string> }
>()("effect-auth/PhoneRequestContext") {}
