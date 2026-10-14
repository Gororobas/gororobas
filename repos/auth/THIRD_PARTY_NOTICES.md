# Third-party notices

Yielded credits the open-source projects and independent standards behind its
cryptography. The [crypto package notices](packages/crypto/THIRD_PARTY_NOTICES.md)
record the exact source revisions, authors, licenses, affected files, and the
adapted Noble implementations and Noble, Wycheproof, Argon2 and standards test
material. That file is
included in the published `@yielded/crypto` package.

The [JOSE package notices](packages/jose/THIRD_PARTY_NOTICES.md) credit Filip
Skokan’s MIT-licensed [panva/jose](https://github.com/panva/jose) and record the
pinned revision, adapted tests and implementation influence. That notice ships
in `@yielded/jose`; panva/jose is used only for development interoperability proof.

The [OAuth package notices](packages/oauth/THIRD_PARTY_NOTICES.md) credit Filip
Skokan’s MIT-licensed openid-client and oauth4webapi for adapted protocol test
contracts. The owned runtime uses Effect and first-party JOSE; those SDKs are not
runtime dependencies.
