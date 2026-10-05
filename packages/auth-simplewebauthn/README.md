# @yielded/auth-simplewebauthn

Browser WebAuthn ceremonies and server verification for Yielded Auth, backed by
SimpleWebAuthn. Import `@yielded/auth-simplewebauthn/Browser` for `make()` and
`layer`, or `/Server` for `make(options)` and `layer` using `PasskeyConfig`.
Install the matching `@simplewebauthn/browser` or `@simplewebauthn/server` peer.

Applications own challenges, credentials, request binding, sessions, and policy.
The browser adapter runs only the local ceremony inside the caller's Scope.

See the [passkey guide](https://yielded.dev/auth/guide/passkeys).
