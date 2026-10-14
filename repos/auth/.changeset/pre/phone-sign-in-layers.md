---
"@yielded/auth": minor
---

Default strategy constructors to behavior-only configuration and supply infrastructure through Layers. Add optional phone message rendering and an Effect HTTP adapter at `@yielded/auth/adapters/Twilio` requiring `TwilioConfig` and `HttpClient`.

BEHAVIOR CHANGE: Supply `ProofKeys` for code verification and `SmsDelivery` for phone delivery instead of constructor keys and template labels. Enable phone lifecycle operations with `PhoneOtp.make({ lifecycle: true })` on the same strategy. Supply `PasskeyConfig` to both passkey strategies and the `layerSimpleWebAuthnPasskeyProtocol` Layer value. Preserve existing namespaces and key IDs; outstanding requests created with custom template labels require a fresh flow.
