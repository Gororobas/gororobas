# @yielded/auth

Composable authentication workflows for Effect applications: sign-in, sessions,
OAuth, passwords, passkeys, email and phone proofs, and TOTP.

```sh
bun add @yielded/auth@beta effect
```

The package owns authentication workflows and OAuth/OIDC verification.
Applications own identity, persistence, keys, policy, private delivery, and crypto
backend selection. Resources live in the caller's Scope; credentials stay outside
public results and telemetry. Runtime dependencies are Effect and `@yielded/oauth`.
General cryptographic operations use `effect/crypto`. `WebCrypto.layer` from
`@yielded/auth/WebCrypto` supplies a portable preset for randomness, digests,
HMAC, encryption, and signatures.

On Cloudflare Workers, use `@yielded/auth-platform-workerd` for crypto,
password hashing, and bounded KDF admission. Supply keys and HTTP clients separately;
see [runtime setup](https://yielded.dev/auth/reference/crypto/#use-with-auth).

OAuth providers require an explicit nonretrying, nonredirecting Effect `HttpClient`.
Keep their construction Scope open throughout use, and retain retired credential
generations while flows or connected grants reference them. An unknown exchange
outcome does not authorize repeating the exchange. See
[OAuth setup](https://yielded.dev/auth/guide/oauth/).

SQL adapters live in `@yielded/auth-persistence` and
`@yielded/auth-persistence-drizzle`. Optional WebAuthn SDK integration lives in
`@yielded/auth-simplewebauthn`. Auth renders private email messages; your
`EmailDelivery` service sends them.

Start with the [setup guide](https://yielded.dev/auth/guide/getting-started/),
or read [how authentication fits together](https://yielded.dev/auth/guide/authentication/).
