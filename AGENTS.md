# Gororobas.com

Gororobas is social network for agroecology built with React Native, EffectTS and SQLite.

This project uses pnpm.

Do not commit or modify the git history on your own.

## Dependency installation

Use **pnpm** for dependency installation and updates.

- ✅ `pnpm install`
- 🚫 do not run `bun install`

Use `pnpm run` to execute project scripts (type-check/lint/test).


## Philosophy

This codebase will outlive you. Every shortcut becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## Typescript

Do not set `as any`, `@ts-ignore` or `@ts-expect-error` when you're stuck. Think hard about types and find ways to make them work.

## Effect v4 beta

We're using the Effect v4 beta, which includes some breaking changes from Effect v3. Make sure to read the effect-v4 folder  (which a git submodule) to go through the new version's source code when proposing changes.

## Database

Unified, up-to-date database schema is located in `packages/server/src/db/schema.sql`. We use `@ariga/atlas` to generate migration files based on diffs in the schema.

Per `packages/server/src/sql.ts`, we use Effect SQL's `transformResultNames` and `transformQueryNames` to auto-convert properties from `snake_case` in SQL to `camelCase` in Typescript, back-and-forth.

## Comments

When there are comments in the code, don't delete them if they're still relevant. Only valid case for removing or rewriting comments is for when they become stale (such as in a behavior change or the removal of a @TODO).

When writing new code, only add comments to clarify non-obvious aspects. Examples:

```ts
// 🚫 BAD - these comments are just replicating the methods' names, they're obvious and shouldn't exist
Effect.gen(function* () {
  const repo = yield* ProfilesRepository

  // Insert profile
  yield* repo.insertProfile(profile)

  // Verify handle is in use
  const inUse = yield* repo.isHandleInUse(profile.handle)
  return inUse === true
})

// ✅ GOOD - commenting workflow-related cerimonies
/**
 * Bump this when prompts, examples, or extraction logic changes.
 * Format: ISO date + revision number within that day.
 */
export const CLASSIFICATION_VERSION = "2026-02-19.1" as const

// ✅ GOOD - commenting a non-obvious reason for why a piece of code exists
/**
 * Adaptation of BunRuntime.runMain (which calls @effect/platform/Runtime's `makeRunMain` internally) with a custom ManagedRuntime.
 *
 * In use because we need a shared runtime with better-auth in order to re-use the same database connection.
 */
export const runMainWithCustomRuntime = ...
```

## Naming

Avoid abbreviations as much as possible. For objects/structs properties, use `snake_case` to comply with SQL tables.

Folders and Typescript file names should be `kebab-case`. Ex: `/packages/server/repositores/resources-repository.ts`

## Ensuring quality

⚠️ **CRITICAL**: always run the following checks (in order) to ensure your contribution is correct:

1. `pnpm run type-check`
2. `pnpm run lint`
3. `pnpm run test`

## Session Completion

**When ending a work session**, you MUST complete ALL steps below.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
