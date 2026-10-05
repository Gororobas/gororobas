# @yielded/auth-crypto

Maintained Noble implementations of Yielded Auth's cryptography services.
Applications choose and provide the implementation Layer:

- `/Password`: `layer(config?)` supplies `PasswordHashing`; provide
  `PasswordKdfAdmission` and Effect `Crypto` for bounded work and entropy.
- `/Totp`: `layer` supplies `TotpCryptography` and requires application-owned
  `TotpSecretKeys`.
- `/OAuth`: `transactionLayer`, `linkTransactionLayer`,
  `connectedTransactionLayer`, and `connectedTokenLayer` each take their purpose's
  keyring and require Effect `Crypto`.

Keep dedicated keys for each purpose. Retain retired keys while stored data still
references them. The adapters preserve Argon2id/legacy PBKDF2 verification, RFC 6238
TOTP, AES-GCM envelopes, XChaCha20-Poly1305 envelopes, and their existing authenticated
context and recovery-digest formats. No credential or data reset is required.

The root exports `digest` and `randomId` for persistence adapters; use the direct
`/Password`, `/Totp`, or `/OAuth` modules for the corresponding adapters. Portable
async KDFs are not off-thread workers, and JavaScript cannot guarantee zeroization
or constant-time execution.
