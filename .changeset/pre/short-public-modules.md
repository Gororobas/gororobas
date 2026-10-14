---
"@yielded/auth": minor
---

Group shared definitions under `@yielded/auth/contracts` and server methods under `@yielded/auth/strategies`, preserving distinct names such as `PasskeyContract` and `Passkey`. Expose `Http` from the root and shorten passkey and TOTP contract constructors.

BEHAVIOR CHANGE: Replace `makePasskeyContract`, `makePasskeyRegistrationContract`, and `makePasskeyManagementContract` with `PasskeyContract.make`, `.makeRegistration`, and `.makeManagement`; replace `makeTotpContract` with `TotpContract.make`.
