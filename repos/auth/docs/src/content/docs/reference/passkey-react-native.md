---
title: iOS passkey adapter
description: iOS passkey capabilities, local outcomes, and prompt lifecycle.
---

Import `* as ReactNativePasskey` from `@yielded/auth-react-native` in the native
entrypoint only. `ReactNativePasskey.make()` returns an Effect of the service
implementation; `ReactNativePasskey.layer` provides the `PasskeyReactNative` service.
Construction performs no native I/O. Each ceremony owns an internal Effect Scope.

- **`capabilities`**: Input: None. Effect success: `PasskeyReactNativeCapabilities`.
- **`register(started)`**: Input: `PasskeyRegistrationStarted`. Effect success: `PasskeyReactNativeRegistration`.
- **`authenticate({ started, mediation })`**: Input: `PasskeyAuthenticationStarted`, `"required"` or `"conditional"`. Effect success: `PasskeyReactNativeAuthentication`.

Registration uses platform passkeys with `attestation: "none"`; `pubKeyCredParams`
must include ES256 (`alg: -7`). A request without ES256 fails before opening a
native prompt. Security-key registration is unsupported; authentication can use
existing platform or security-key credentials.

Registration and authentication return the original `flowId` and a redacted JSON
`response` for the server's Complete call. The adapter validates native output,
but does not verify signatures or replace server validation.

## Capabilities and lifecycle

`capabilities.supported` checks OS support, not native linking, associated domains,
key availability, or account configuration. `conditionalGet` and `cancellation`
are always `"unsupported"`. Interruption stops the Effect and discards a late
response, but **cannot dismiss the system prompt**. Timeouts have the same limit.
Every adapter instance in one installed module shares a busy guard until the native
promise settles. If it never settles, the guard stays busy for that JS runtime.
Use one installed copy and route all ceremonies through it; direct peer calls
cannot participate in the guard.

- **`PasskeyReactNativeInputRejected`**: Invalid or expired input.
- **`PasskeyReactNativeUnsupported`**: Unsupported OS, mediation, or registration algorithms; exclusions unavailable on this iOS version.
- **`PasskeyReactNativeBusy`**: Another native request has not settled.
- **`PasskeyReactNativeNotCompleted`**: Sanitized `reason`: `cancelled`, `no-credentials`, `credential-exists`, `interrupted`, `timed-out`, or `request-failed`.
- **`PasskeyReactNativeInvalidResponse`**: Malformed, oversized, or inconsistent native credential JSON.
- **`PasskeyReactNativeUnavailable`**: Configuration, linking, unexpected native failure, or defect.

Effect interruption stays interruption; it is not converted into a typed native
cancellation. No failure proves that registration created no credential. The adapter
does not retry or complete a server flow after interruption. Preserve the server's
single-use/recovery policy and do not automatically repeat credential creation.
Errors contain no credentials, native messages, or native causes; unwrap the response
only at your protected transport boundary and keep it out of telemetry.

Unexpected native/configuration failures produce a sanitized `reportAuthFailure`
diagnostic at the `passkey-react-native` stage. Expected rejection, cancellation,
and schema validation failures do not produce infrastructure diagnostics.

Ceremonies reject expired started values and time out at the earlier of
`expiresAtMillis` or the start time plus `options.timeout` (1–300,000 ms).
`capabilities` can fail with `PasskeyReactNativeUnavailable`; ceremony failures
are the `PasskeyReactNativeFailure` union. All asynchronous operations return
Effects, with no additional service requirement after construction.

See [iOS setup](../guide/passkeys.md#prompt-in-an-ios-react-native-app) for peer
installation, runtime prerequisites, associated domains, and signed-device proof.
