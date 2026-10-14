# Security policy

Yielded Auth is an authentication library. Treat any report about credential
handling, session authority, or authorization decisions as security relevant.

## Supported versions

The published packages are a prerelease. `@yielded/auth` and its companions
(`@yielded/crypto`, `@yielded/jose`, `@yielded/oauth`, `@yielded/auth-persistence`,
`@yielded/auth-persistence-drizzle`, `@yielded/auth-simplewebauthn`,
`@yielded/auth-react-native`, `@yielded/auth-electron`, and `@yielded/drizzle-effect-v4-patch`) are versioned
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
- Password sign-in and password-change verification use per-identifier,
  per-subject, and per-action token buckets. Their default store is bounded to
  10,000 keys per runtime, is local to one process, and resets on restart.
  Multi-instance deployments must supply a shared Effect `RateLimiterStore` or
  replace `PasswordAttemptLimiter`. Consumption precedes credential verification, is never
  refunded, and store failures deny the request. The fixed cap does not grow with
  policy budgets; at capacity, requests needing new keys fail with
  `PasswordUnavailable`. Active buckets are never evicted. Hosts also own network admission
  and the trusted network keys used by phone admission.
- Password hashing holds no database transaction. Session issuance rechecks the
  original subject and credential revisions and current factor policy under the
  committing authority. Credential replacement must atomically update the password
  and authority credential revisions; identifier rebinding or eligibility changes
  must bump the subject security revision. Conditional rehashing changes only the
  verifier and its version. Fresh password sign-ins are independent attempts;
  pending-factor completion and handoffs retain their replay guards.
- Passkey begin and completion requests use bounded process-local token buckets
  for global, subject and target budgets. Multi-instance deployments must provide a
  shared Effect `RateLimiter` or `RateLimiterStore`. Hosts own network admission
  and limits for malformed traffic.
- Proof issue and attempt limits use bounded token buckets and charge suppressed,
  repeated requests, unknown targets and malformed candidate secrets. Schema-invalid
  requests are covered by host ingress. Supply a shared store across replicas.
  Each code has its own durable failed-attempt count and resend cooldown. One
  confirmed issue permits one local delivery; unknown commits never dispatch, and
  crashes can leave codes unsent. Protected mutations redeem atomically with their
  writes; sign-in consumes before independent session issuance and restarts on failure.
- Retired phone identifiers remain permanent tombstones. Matching a recycled number
  never authorizes provisioning, transfer or account linking.
- Identity selection, account provisioning, transaction authority, and
  authorization policy belong to the application. Provider claims and email
  addresses never select a subject on their own. Provisioning completes synchronously
  and idempotently by request ID before registration succeeds.
- Password changes may accept recent passkey step-up through application action
  policy. The policy binds the actual factor and authentication time to the action;
  persistence rechecks current subject and credential authority at commit. A passkey
  user who forgets their password signs in with the passkey and then changes it.
- OAuth linking retains one exact begin authorization, including verified private
  session evidence when application policy accepts recent step-up. Linking preserves
  sessions; unlinking rechecks remaining login methods and invalidates according to
  the configured session mode. Callback consumption precedes provider exchange, and
  unknown exchange or session-issuance outcomes require a new ceremony. Refresh
  retains an exact versioned claim with no expired takeover. Token-use policy sees
  the captured grant and current authority before tokens are unsealed; writes
  check accepted action bindings, revisions, and deadlines without retiming proofs.
- Passkey enrollment retains one begin authorization and re-assesses it at commit.
  Challenges retain their selected RP profile through expiry during rolling deploys.
  Verified challenges are consumed before independent session issuance; failed or
  uncertain issuance requires a new ceremony. Enrollment preserves existing sessions;
  removal increments the security revision and applies session invalidation.
- Protected mutations and application writes must share the adapter's explicit
  commit owner. Final checks run after application work; D1 requires declared
  mutable policy inputs. Cleanup is bounded and module-scoped, preserves live
  proofs, and never makes an uncertain external operation safe to retry.

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
