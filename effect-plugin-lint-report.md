# Effect plugin lint report

Updated 2026-10-06 against the installed `@mpsuesser/oxlint-plugin-effect` 0.6.0. **No lint errors remain; 67 warnings remain.** The previous report had 281 Effect errors. The reduction includes fixes, requested rule exclusions and explained local exceptions; it is not a count of distinct bugs repaired. Solved rules have been removed from the remaining-findings list.

## Requested configuration

- In TypeScript test/spec files and test helpers, disabled `avoid-option-getorthrow`, `avoid-untagged-errors` and `avoid-direct-json`.
- Globally disabled `prefer-option-over-null`, `no-conditional-empty-object-spread` and `no-shape-in-symbol-names`.
- Followed the later, more specific dictionary instruction: `no-unsafe-dictionary-type` remains active, with concrete contracts where available and individual exemptions at heterogeneous interpreter/legacy boundaries. `no-unknown-parameters` also remains active with explained local exemptions.
- Retained `custom-lint-rules/no-node-apis`: the plugin rules do not provide equivalent coverage. The custom rule catches bare built-ins such as `crypto` and `sqlite`, re-exports, dynamic imports, CommonJS require and import types. `avoid-node-imports` only matches selected `node:` sources; `use-http-client-service` targets HTTP imports. Required Node server factories, SQLite reference tests and JWT signing fixtures have local exceptions.
- Earlier sort/runtime/tracing/service-import choices and migration-preview exemptions remain. Temporary-resource enforcement remains active.

## Maintainability fixes

- Renamed `OAuthIdentity.emailVerified` to `isEmailVerified` and updated its producers, storage consumers and tests. Also renamed the test-only boolean fixture to `isOAuthFirst`.
- BDD placeholder dictionaries now contain strings/numbers; extracted data tables have a concrete value contract. Background context no longer uses `Record<any, any>`: `getBackgroundContext(schema)` validates the context instead of trusting a generic type argument. Repository callers were updated.
- CRDT decoding uses decoder constraints and `Schema.decodeUnknownEffect`, removing the generic `as never` bridge. Projection exceptions remain captured as typed validation failures, with a property-based regression test. Loro rich-text projections validate node names, inserts and attributes before returning JSON. Explicit Loro declaration imports remove unresolved diff types that had weakened downstream typing.
- Converted ordinary fixture/provider loops and native object transformations to Effect helpers, preserving sequential execution. Deduplication uses Effect collections; finite OAuth provider configurations use a concrete keyed object. Intentional key omission remains where spreads are clear.
- Browser database lifecycle errors are tagged. Original native driver errors retain SQLite codes for classification, and closing preserves defect semantics through `tryPromise` plus `orDie`. Native callbacks retain structured resource cleanup; the dynamic transaction queue and insertion-ordered pending callbacks have precise local exceptions.
- OAuth callback recovery now catches its expected HTTP request error explicitly and preserves no-store/referrer protections. JSON serialization uses schema codecs where appropriate. Fixed timestamp fixtures use DateTime; telemetry and mocks use actual interface types. The global Node stack hook is restored in finally.

## Startup wiring

The double assertion in [runMainWithCustomRuntime](/Users/h/dev/gororobas/apps/server/src/run-main-with-custom-runtime.ts) is gone. Its program requirements must now match the managed runtime. The resulting type errors exposed missing request-service wiring and CORS installed outside its router lifetime.

[ApiLive](/Users/h/dev/gororobas/apps/server/src/api-live.ts) now registers the seven implemented groups and provides their request services explicitly. The shared domain API still declares wiki, but the server has no wiki handlers; those routes currently return 404. Protected profile lookup gets its request session correctly. CORS is installed inside the router application before serving. [The integration test](/Users/h/dev/gororobas/apps/server/src/api-live.test.ts) checks complete layer construction, authentication on implemented routes and the unavailable wiki route.

## Remaining findings

| Rule | Severity | Findings |
| --- | --- | ---: |
| `import(namespace)` | warning | 67 |

### `import/namespace` examples

Oxlint reports unresolved namespace exports, predominantly Loro Mirror schema members. The installed declarations expose the members in these examples, and all workspace TypeScript checks pass. These warnings remain visible; they were not disabled as part of the Effect cleanup.

- [packages/domain/src/crdts/domain.ts:49](/Users/h/dev/gororobas/packages/domain/src/crdts/domain.ts:49): `export const PublicationLocalizedDataLoro = loroSchema.LoroMap(` — "LoroMap" not found in imported namespace "./schema/index.js".
- [apps/server/src/publications/publication-loro.lib.ts:11](/Users/h/dev/gororobas/apps/server/src/publications/publication-loro.lib.ts:11): `export const PublicationLocalizedDataLoro = loroSchema.LoroMap(` — "LoroMap" not found in imported namespace "./schema/index.js".

## Validation

- `pnpm run quality-gates` **passes**, including formatting, every workspace type check, lint and **233 root tests in 23 files**.
- The affected server suite passed **35 tests in 9 files**. The final API integration test also passed after its explicit guest request context was added.
- `git diff --check` passes. No commits or history changes were made.

An earlier root run again falsified `PublicationTranslationRow round-trip preserves data`. Later full runs passed. That intermittent property failure is not repaired by this lint work: its property and assertion remain unchanged, and passing reruns do not prove the behavior correct. Temporary diagnostic instrumentation was removed.
