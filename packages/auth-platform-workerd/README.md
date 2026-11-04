# @yielded/auth-platform-workerd

Cloudflare Workers crypto and password services for Yielded Auth. Owns the WASM Argon2id
implementation; password policy and admission remain in Auth.

```sh
bun add @yielded/auth-platform-workerd@beta @yielded/auth@beta effect
```

Provide `layer` from the package root for crypto and password hashing.
Use `layerWith({ passwordHashing, kdfAdmission })` to configure costs and capacity.
The root requires `nodejs_compat`; Wrangler bundles the included WASM asset.
Applications without password hashing can use `WebCrypto.layer` from
`@yielded/auth/WebCrypto`. Supply an HTTP client separately when needed.

Retain the built Layer across requests to share password admission limits.
Applications supply storage, account policy, keys, delivery, and protocol adapters.
