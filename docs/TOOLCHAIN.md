# Repository toolchain

Vite+ owns repository commands; Bun is the package manager and script runtime.
Use `vp help` and command help for options.

## Development

Run `vp install` to install dependencies, patch TypeScript with Effect diagnostics,
and configure Git hooks. Run `vp run ready` before handoff.

`vp check` runs formatting and linting. `vp run check` also runs the patched
compiler across workspaces and scripts. Include `vp env doctor` output when
reporting toolchain failures.

Shared versions live in the root catalog. Upgrade the Effect family together and
rerun installation. Keep the catalog's Vitest version aligned with Vite+'s bundled
runner so Effect's test integration uses the same version.

The Drizzle compatibility patch comes from `@yielded/drizzle-effect-v4-patch`;
remove it when Drizzle publishes a compatible release. Drizzle examples use
`scripts/db-generate.ts` to generate SQL and compact JSON snapshots.

When changing the workerd Argon2 compression routine, regenerate the checked-in
Wasm with `vp run @yielded/crypto#build:wasm`. This requires LLVM Clang with the
wasm32 target and `wasm-ld`; ordinary builds do not require a C toolchain.

Repository skills live under `.agents/skills`. Use the `dev-kit` skill to update
catalog copies without overwriting local changes.

## Package verification

`vp run check:package-consumers` requires built packages and runs during `build`.
Use direct subpaths for lazy imports and narrow bundles. Reported bundle sizes
include Effect and are diagnostics, not fixed budgets.

Exercise workerd backends through Wrangler: Node and browser package probes do
not cover their Wasm module loading.

## Releases

Public packages share a Changesets fixed group and beta version. Add a changeset
for consumer-visible changes; inspect the plan with `vp run changeset status`.
Retain consumed notes in `.changeset/pre/` for the stable release. Leaving
prerelease mode requires an explicit release decision.

To enable automated releases:

1. Give the release GitHub App contents and pull-request write access.
2. Configure repository secrets `EFFECT_AUTH_APP_ID` and `EFFECT_AUTH_APP_PRIVATE_KEY`.
3. Configure npm trusted publishing for each public package from `yielded-dev/auth`,
   workflow `release.yml`, with direct publishing enabled. A package's first
   publication may require an authenticated owner.
4. Set the repository variable `RELEASE_ENABLED=true`.

For an authorized manual release, run the handoff gate,
`vp run changeset:version`, and `vp run release:publish --dry-run`. Then run
`vp run release:publish` and push the generated tags. Manual publishing requires
npm access to the `yielded` organization. The dry run publishes nothing and
creates no tags; the publish task restores source manifests after packaging.

## CI and review

Require `ready` and `Effect Agent review` in the main branch ruleset. Review needs
the repository secret `OPENAI_API_KEY` and a `pr-review` environment without
required reviewers. Fork CI may require separate GitHub workflow approval.

Title and description edits do not rerun CI. After changing a PR's base, close and
reopen it to validate the new diff. Draft PRs skip agent review. To retry a stopped
review, use an authorized `@effect-agent review full` comment or manual workflow
dispatch; `@effect-agent review` requests an incremental pass.

## Documentation

Public pages live in `docs/src/content/docs/`; the sidebar is in
`docs/astro.config.ts`. Run `vp run docs:dev` locally, `vp run docs:build` to check
links and build, and `vp run docs:preview` to preview the build.

Use relative Markdown links. Shared README examples use
`<!--@include: @/../README.md#region-->` in Markdown and `<Snippet>` in MDX.
This contributor guide is excluded from the public site.

`alchemy.run.ts` deploys the site at `https://yielded.dev/auth/` using the
`effect-auth-docs` Worker and account-wide Cloudflare state store. With
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` set, review changes using
`vp run docs:plan --stage prod`; deploy only when authorized using
`vp run docs:deploy --stage prod --yes`.

The `Deploy docs` workflow needs the same credentials as repository secrets.
The token needs access to the account's Secrets Store and permission to manage
the Worker, custom domain, zone routes, DNS record, and legacy redirect rule.
