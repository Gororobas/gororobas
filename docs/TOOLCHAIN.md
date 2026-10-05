# Repository toolchain

Vite+ is the command authority; Bun is the package manager and script runtime.
The root catalog owns shared versions, and the lockfile is committed. Workspace
manifests use `catalog:` and `workspace:*`. CI installs the frozen lockfile and
uses the same checks as local development.

## Development

Run `vp install`, then `vp run patch:tsgo`. The prepare hook installs `.vite-hooks`;
the pre-commit hook runs Vite+ checks on staged TypeScript and JavaScript.
`vp run ready` is the handoff gate: static checks, tests, package builds, and docs.
Use `vp help` and command help for task options. Include `vp env doctor` output
when investigating toolchain failures.

Shared strict compiler settings live in `tsconfig.base.json`. Public packages
use Effect as a peer and the exact catalog pin for development; the standalone
patch CLI bundles its tooling dependencies. Upgrade the
Effect family together and rerun installation and the handoff gate. Vite+ 0.3.3
bundles Vitest 4.1.11. The root override pins `vitest` to the catalog,
which keeps Effect's test integration on that Vitest despite its Vitest 5 peer range,
matching Effect Agent; keep the catalog `vitest` pin equal to the bundled version. The `preferTypedSchemaDecoder` diagnostic follows the reference repository's disabled
setting until the upstream TypeScript-Go panic is resolved.

The root `patchedDependencies` carries a Drizzle patch from
`@yielded/drizzle-effect-v4-patch`. The patch CLI configures the same Drizzle asset
for Bun consumers; it bundles its own tooling dependencies and adds no application
runtime dependency. Remove the patch when Drizzle publishes a compatible release.
Alchemy and Distilled use the installed Effect APIs without compatibility patches.
After upgrading deployment dependencies, run `vp run ready` and
`vp run docs:plan --help` to verify consumers and the deployment CLI.

Library code lives in `packages/*`; public consumer examples are leaf workspaces
under `examples/*`. Internal adapter fixtures belong to the package's `test/fixtures`.
Every workspace and repository script is typechecked. Add, retain, and remove
tests according to the repository's testing policy; existing coverage is not a quota.

The Drizzle examples run generation through `scripts/db-generate.ts`. It forwards
Drizzle Kit arguments and compacts JSON snapshots to one line. Snapshots are excluded
from formatting and marked as generated in Git; SQL remains available for review.

## Public modules

Use explicit, flat source exports with matching `vp pack` entries. Root namespaces,
the lowercase `contracts` and `strategies` groups, and direct subpaths identify the
same public modules. Group exports retain distinct contract and strategy names.
Guides and consumer examples prefer named namespace imports from `@yielded/auth`,
including types and services accessed through their module namespace. Keep direct
paths for adapter entrypoints, test helpers, and examples of subpath or lazy imports.
Internal imports go directly to their owning implementation, without routing
through self-barrels.

CLI packages declare flat `./dist/command.mjs` binaries with matching
`src/command.ts` pack entries. They may have an empty export map. Export and purity
checks cover these executable entries, and publishing checks the built binaries.

The export check validates casing, namespace targets, build entries, and workspace
dependencies, including relative imports through the package's own public barrels.
Core may depend only on Effect; SDK and cryptography implementations belong in
companion packages. The export check enforces
this boundary for runtime imports and declarations. The purity check rejects
production paths that reach test-only code.
SDK adapters live in companion packages, and `sideEffects: []` requires import-time code to stay free of I/O.

The package build preserves implementation modules and native root/group namespaces
in both JavaScript and declarations. Every namespace target is also an explicit
pack entry. The resolver leaves sibling imports external to root and group entries
so the bundler does not synthesize namespace objects or expose helper exports.
Do not merge unrelated implementations into shared chunks: consumer bundlers can
retain their initialization even when only one API is used.

`vp run check:package-consumers` requires built packages and runs during `build`.
It loads and type-checks every core export with only Effect installed, then every
default persistence export without Drizzle installed. It stages the publisher's
manifests and built files with the selected adapters' required dependencies,
compares equivalent root/group/direct consumers through esbuild and Vite/Rolldown,
checks their declarations, and runs native ESM and bundled consumers. It protects
narrow identity imports, browser contracts, deferred client loading, and root
namespace identity without optional adapter peers. Reported initial/deferred
bytes include Effect and are diagnostics, not fixed size budgets. Retained-module
checks enforce the boundaries; esbuild's re-exported namespace retention remains
visible in the comparisons. The full contracts group must exclude strategy
implementations and cryptography. Keep direct paths for lazy imports and narrow bundles.

## Contributor skills

Repository-owned skills under `.agents/skills` are linked from `.claude/skills`;
Dev Kit copies have individual `.dev-kit-origin.json` receipts. Use the `dev-kit` skill for catalog
updates. Dev Kit is not a runtime dependency or repository lifecycle manager.

## Releases

All public packages, including the Drizzle patch CLI, share one Changesets fixed
group and one beta version. Add a changeset naming the affected packages for
consumer-visible changes; the whole group is versioned and published together.
Keep `.changeset/config.json` aligned with new public workspaces. Private examples
and documentation are not versioned or published. Do not leave prerelease mode
without an explicit release decision.

`release:publish` builds and temporarily converts source manifests to
npm-ready exports and resolves catalog/workspace ranges, then restores the original
files on success, failure, or interruption.

Before enabling automated releases:

1. Give the release GitHub App contents and pull-request write access to this repo.
2. Configure `EFFECT_AUTH_APP_ID` and `EFFECT_AUTH_APP_PRIVATE_KEY` repository secrets.
3. Configure npm trusted publishing for each published package, including
   `@yielded/auth`, `@yielded/auth-persistence`, `@yielded/auth-persistence-drizzle`,
   `@yielded/auth-simplewebauthn`, `@yielded/auth-react-native`, `@yielded/auth-electron`,
   `@yielded/auth-openid-client`, `@yielded/auth-crypto`,
   and `@yielded/drizzle-effect-v4-patch`, repository
   `yielded-dev/auth`, workflow `release.yml`. The first npm publication may
   require a manually authenticated owner before trusted publishing can be set.
   Enable direct `npm publish` for this trusted publisher; the release workflow
   does not use staged publishing.
4. Set the repository variable `RELEASE_ENABLED=true`.

The release workflow maintains a version PR using the App token so updates trigger
ordinary CI. After merge, it validates unpublished versions with the full ready gate
and publishes to npm with provenance. Initialization alone does not enable publication.

For a manual release, run the handoff gate, `vp run changeset:version`, and
`vp run release:publish --dry-run`. Once authorized, run `vp run release:publish`
and push the generated tags. The dry run does not publish or create tags. Manual
publishing requires an npm login with access to the `yielded` organization; the
public prerelease is installed as `@yielded/auth@beta`.

## CI and review

Every pull request reports the required `ready` check. Contributor docs, changesets,
and auxiliary workflows need formatting and workflow validation; published docs
and the root README also get a docs check/build. Source, dependencies, CI setup,
unknown paths, release PRs, and pushes to `main` run the full static, test, and build
gates. Renames and incomplete diffs conservatively select the full gate.

CI uses Vite+ for installation and commands, caches package downloads, and restores
Vite Task results after installation. Vite fingerprints task inputs before reuse;
successful tasks survive a later failure. Astro outputs include generated types,
and Vitest's mutable result cache stays disabled. Timed-out commands restart once;
Vitest retries only timeout errors, up to twice. Dependency and compiler setup can
also retry one failed attempt.

Effect Agent reviews use `GITHUB_TOKEN` and the repository secret `OPENAI_API_KEY`.
Set `PR_REVIEW_ENABLED=true` after the workflow reaches `main`.
Automatic reviews follow completed pull-request CI runs after success or failure;
cancelled runs, drafts, generated release metadata, and stale PR heads are skipped.
For forks requiring GitHub workflow approval, click **Approve workflows to run** once:
CI runs first, then review starts without another approval. All reviews use `pr-review`,
which must have no required reviewers; `pr-review-forks` is no longer used.
Authorized `@effect-agent review` comments start reviews without waiting for CI.
Reviews execute trusted default-branch code and read PR source through GitHub's API;
they never execute PR-head code or consume CI artifacts or caches. Approving CI does
not grant that CI job repository secrets.

## Documentation

The `docs/` workspace is an Astro Starlight site using the shared yielded.dev theme,
`@yielded/starlight-theme` (`yielded-dev/site`). Public pages live in
`docs/src/content/docs/` and the sidebar in `docs/astro.config.ts`.
Run `vp run docs:dev` to edit locally. `vp run docs:build` checks local links and
anchors and produces the static site; `vp run docs:preview` serves that build. Link
pages with relative Markdown paths such as `./sessions.md`. The home page and quick
start include the root README's shared contract, server, and client examples:
Markdown pages use `<!--@include: @/../README.md#region-->` and the MDX home page
uses `<Snippet>`. Guides show feature setup and usage.

Getting started teaches package installation and composition in the reader's own
application. Runnable examples live in `examples/*` and are linked as source references.
This contributor guide stays at the top of `docs/` and is excluded from the public site.

`alchemy.run.ts` deploys the site to `https://yielded.dev/auth/` through the
`effect-auth-docs` Cloudflare Worker at stage `prod`. It uses the account-wide
Cloudflare state store, matching Effect Agent. The Astro base and Worker asset
base both use `/auth/`. The Worker route covers the `/auth` prefix;
other paths on `yielded.dev` remain available for sibling projects. The stack
owns the proxied apex DNS placeholder until a shared Yielded site provides an origin.
The old `effect-auth.com` domain remains attached for TLS and permanently redirects
paths and query strings to the new docs location.
Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your environment, then run
`vp run docs:plan --stage prod` to review changes or
`vp run docs:deploy --stage prod --yes` to deploy. Alchemy builds the docs and
uses their content hash to avoid unchanged uploads.

The `Deploy docs` workflow runs on relevant changes to `main` and supports manual
dispatch. Configure repository secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`; Alchemy resolves the shared state-store credentials from
the account's Secrets Store. The token must also be able to manage the Worker and
its custom domain, zone routes, DNS record, and legacy redirect rule in the selected account.
