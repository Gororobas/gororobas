# Security policy

Yielded Auth is an authentication library. Treat any report about credential
handling, session authority, or authorization decisions as security relevant.

## Supported versions

The published packages are a prerelease. `@yielded/auth` and its companions
(`@yielded/auth-crypto`, `@yielded/auth-openid-client`, `@yielded/auth-persistence`,
`@yielded/auth-persistence-drizzle`, `@yielded/auth-simplewebauthn`,
`@yielded/auth-react-native`, and `@yielded/drizzle-effect-v4-patch`) are versioned
and released together as one fixed group.

| Version                                  | Supported                       |
| ---------------------------------------- | ------------------------------- |
| Latest `0.x` beta on the `beta` dist-tag | Yes                             |
| Earlier betas                            | No. Upgrade to the latest beta. |

Security fixes ship as a new beta of the whole group. Upgrade every `@yielded/*`
package to the same version in one change; mixed versions are unsupported.

## Reporting a vulnerability

Report privately through GitHub:
<https://github.com/yielded-dev/auth/security/advisories/new>

Do not open a public issue, pull request, or discussion for a suspected
vulnerability. Include the affected package and version, the workflow involved
(for example password reset, OAuth callback, or passkey enrollment), a reproduction
or proof of concept, and the impact you believe it has.

You will receive an acknowledgement within three business days and a triage
decision within ten business days. Confirmed reports are fixed in the next beta
release once the fix is verified. Disclosure timing is agreed in the advisory
thread, and reporters are credited in the published advisory unless they ask not
to be.

Problems in the runnable examples or the documentation site are welcome as
ordinary issues unless they expose a weakness in the packages themselves.

## Scope

In scope: the published `@yielded/*` packages, including authentication bypass,
session or credential disclosure, authorization errors, cryptographic misuse,
injection through persistence adapters, and unsafe behavior produced by a
documented configuration.

Out of scope: the examples under `examples/` as deployable products, the
documentation site, third-party provider behavior (OAuth providers, email and SMS
vendors), and findings that require control of the application host, or of its
database together with the application's keys and secrets.

## Deployment boundaries

The library fails closed inside these assumptions. The application owns everything
outside them.

- Serve over HTTPS from the configured origin. Trusted origins and callback URLs
  come from configuration, never from request headers.
- Keep session signing keys, encryption keyrings, proof keys, and provider secrets
  in a secret manager. Generate each key from 32 random bytes and rotate through
  the keyring's key ids rather than replacing a key in place.
- The database is trusted for integrity, not for secrecy. Bearer tokens, codes, and
  recovery codes are stored as digests, and provider tokens and TOTP secrets as
  authenticated ciphertext, so a copied database without the application's keys
  yields no usable credentials.
- The library enforces per-identifier, per-subject, and per-action budgets. It
  cannot see client addresses, so per-network limiting and the network keys used by
  phone admission are the host's responsibility.
- Identity selection, account provisioning, transaction authority, and
  authorization policy belong to the application. Provider claims and email
  addresses never select a subject on their own.

## Security updates and compatibility

Read each release's changelog before upgrading. Entries marked BEHAVIOR CHANGE
require action. A security release may change persisted formats or key handling;
when it does, the changelog states the migration or key rotation needed. Prerelease
versions do not promise compatibility of stored data or keyrings between betas.

## Review history

The maintainers run periodic internal security reviews of the whole repository.
Confirmed findings are tracked as issues and pull requests here rather than in
private notes, and the absence of a published advisory is not a claim that no
weakness exists.
