# @yielded/jose

JOSE for Effect: JWK import/export, public key sets, compact signatures and
encryption, and JWTs whose claims are encoded and decoded by your Effect Schema.
Your application owns keys, accepted algorithms, issuers, audiences and token
purpose. This package depends on `@yielded/crypto` and Effect, independently of Auth.

```sh
bun add @yielded/jose@beta @yielded/crypto@beta effect
```

Import `Jwk`, `Jwks`, `Jws`, `Jwt`, and `Jwe` from the root. Supply cryptographic
services through an explicit crypto backend Layer. Local verification needs no
HTTP; remote JWKS use an application-configured HTTPS URL and an Effect HttpClient,
with a bounded cache and refresh lifetime owned by the Layer's Scope.

Tokens, private keys, symmetric keys and decrypted bytes use `Redacted`. JWT
verification checks the signature and registered claims before decoding your
application Schema. Schema encoding/decoding failures and services remain in
`E` and `R`; custom Schema diagnostics remain application-owned.
`Jwt.decodeUnverified` only parses and never establishes trust.

The supported profile is compact JWS/JWT with HS256, RS256, PS256, ES256 and EdDSA
(Ed25519), and compact JWE with `dir` / `A256GCM`. Other algorithms, JSON
serialization, unencoded/detached payloads, critical extensions and compression
are unsupported. OAuth, discovery, sessions and account authority belong to
other layers.

See the [usage and profile reference](../../docs/src/content/docs/reference/jose.mdx)
and the [shipped third-party notices](THIRD_PARTY_NOTICES.md).
