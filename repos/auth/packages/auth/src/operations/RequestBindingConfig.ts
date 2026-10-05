import { Context, Layer } from "effect";

import type { RequestBindingConfiguration } from "./requestBinding";

/** Dedicated request-binding keys, shared by the selected authentication methods. */
export class RequestBindingConfig extends Context.Service<
  RequestBindingConfig,
  RequestBindingConfiguration
>()("effect-auth/RequestBindingConfig") {
  static readonly layer = (configuration: RequestBindingConfiguration) =>
    Layer.succeed(this, configuration);
}
