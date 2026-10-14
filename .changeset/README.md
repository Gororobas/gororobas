# Changesets

This directory contains release notes for the public Yielded Auth packages.

All public packages share one version on the `beta` release train. Name the affected
packages in changesets for consumer-visible changes; Changesets bumps and releases
the entire fixed group together. Add new public packages to the fixed group in
`config.json`. Private examples and documentation are not versioned or published.

Create a changeset, review the generated version plan, and merge the automated version PR to
publish. The repository-specific publisher must be used instead of `changeset publish`; see the
release runbook in `docs/TOOLCHAIN.md` for the automated path and manual fallback.

Pending changesets live directly in this directory. Changesets moves consumed
beta release notes to `pre/` and keeps only the prerelease mode and tag in
`pre.json`. Retain the archived notes for the eventual stable release.
