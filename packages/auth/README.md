# @yielded/auth

Composable authentication workflows for Effect applications: sign-in, sessions,
OAuth, passwords, passkeys, email and phone proofs, and TOTP.

```sh
bun add @yielded/auth@beta effect
```

The package owns authentication workflows and OAuth/OIDC verification.
Applications own identity, persistence, keys, policy, private delivery, and crypto
backend selection. Resources live in the caller's Scope; credentials stay outside
public results and telemetry. Runtime dependencies are Effect and the first-party
`@yielded/crypto`, `@yielded/jose`, and `@yielded/oauth` packages.

On Cloudflare Workers, provide `WorkerdPasswordlessServices.layer` from
`@yielded/auth/WorkerdPasswordlessServices` for runtime crypto and HTTP without Wasm.
Use `@yielded/auth/WorkerdServices` to include password hashing and bounded KDF
admission. Other runtimes can compose crypto Layers explicitly. Supply keys separately;
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
