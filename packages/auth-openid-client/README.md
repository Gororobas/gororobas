# @yielded/auth-openid-client

OAuth/OIDC protocol adapters for Yielded Auth, backed by `openid-client`.
The root exposes sign-in provider configuration; `/Connected` manages connected
grants, and `/GitHub` configures GitHub OAuth Apps through the same verifier.

Applications own credentials, callback destinations, persistence, identity mapping,
and authorization. Token exchanges are never retried automatically. Retain retired
client registrations while stored flows and grants still reference them.

Transport uses Effect’s `FetchHttpClient.Fetch` service, defaulting to the platform
Fetch implementation. Provide a custom Fetch service when building the protocol
Layer; it must honor cancellation and never retry requests or log credentials.

See the [OAuth guide](https://yielded.dev/auth/guide/oauth).
