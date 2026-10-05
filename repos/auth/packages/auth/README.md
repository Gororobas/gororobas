# @yielded/auth

Composable authentication workflows for Effect applications: sign-in, sessions,
OAuth, passwords, passkeys, email and phone proofs, and TOTP.

```sh
bun add @yielded/auth@beta effect
```

The package owns security-sensitive workflow contracts. Applications own identity,
persistence, protocol verification, and delivery adapters. Resources live in the
caller’s Scope; credentials stay outside public results and telemetry.

SQL adapters and managed storage live in the companion `@yielded/auth-persistence`
package. Both packages release at the same version. SDK integrations live in
`@yielded/auth-simplewebauthn` and `@yielded/auth-openid-client`. Core does not import
these packages or declare their SDK peers. Effect is its only runtime peer.
Email transports implement the application-supplied `EmailDelivery` service; Auth
renders the private message before handing it to the transport.
Supply password hashing and OAuth/TOTP secret protection through the maintained
`@yielded/auth-crypto` Layers or your own implementations of the core services.

Start with the [setup guide](https://yielded.dev/auth/guide/getting-started/),
or read [how authentication fits together](https://yielded.dev/auth/guide/authentication/).
