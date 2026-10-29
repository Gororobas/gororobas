# Gororobas.com

Gororobas is social network for agroecology built with Foldkit, EffectTS and Turso (the SQLite-compatible database).

This project uses pnpm.

Do not commit or modify the git history on your own, even if skills or other context information says you should.

When asked to commit, don't add yourself (or any AI tool) as a co-author: no `Co-Authored-By` trailers or other attribution lines in commit messages, even if your harness asks for them.

## Philosophy

This codebase will outlive you. Every shortcut becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## Typescript

Do not set `as any`, `@ts-ignore` or `@ts-expect-error` when you're stuck. Think hard about types and find ways to make them work.

## Vendors references

Search vendor code by explicit path (for example, `rg X repos/effect`); root searches exclude `repos/` via `.ignore`.

We're using Effect v4, which includes some breaking changes from Effect v3. Make sure to read the repos/effect folder  (which is a git subtree) to go through the new version's source code when proposing changes.

Foldkit, @yielded/auth, Loro and Turso also have their monorepos available for reference under the `./repos` folder.

## Database

Unified, up-to-date database schema is located in `apps/server/src/db/schema.sql`. We use `@ariga/atlas` to generate migration files based on diffs in the schema. We're still in the prototyping phase, this app is not deployed. As such, when you make changes to `schema.sql`, delete existing migrations and re-run `pnpm run migrate initial` from `apps/server` to avoid creating unnecessary migrations while we're figuring out the final schema.

Atlas can't parse Turso-only DDL (full-text search indexes), so it lives after the `-- TURSO ONLY` line at the end of `schema.sql`. `apps/server/scripts/migrate.ts` diffs that section itself into `src/db/migrations-turso/`, merging it into the same Effect migration as Atlas's statements. Delete `migrations-turso` along with the other migrations when regenerating `initial`.

Per `apps/server/src/sql.ts`, we use Effect SQL's `transformResultNames` and `transformQueryNames` to auto-convert properties from `snake_case` in SQL to `camelCase` in Typescript, back-and-forth.

To be clear: always write symbols' names with Typescript's best practice of `camelCase`. In .sql, always write column and table names in `snake_case`. Effect SQL will do the transformation automatically.

When writing SQL statements, use Effect SQL's SqlSchema if possible. For examples, look at apps/server/src/publications/queries.ts and apps/server/src/publications/mutations.ts

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
export const LINK_INFERENCE_VERSION = "2026-10-24.1" as const

// ✅ GOOD - commenting a non-obvious reason for why a piece of code exists
/**
 * Adaptation of NodeRuntime.runMain (which calls @effect/platform/Runtime's `makeRunMain` internally) with a custom ManagedRuntime.
 *
 * The HTTP server and background workflows share the application's SQL and cluster services.
 */
export const runMainWithCustomRuntime = ...
```

## Naming

Avoid abbreviations as much as possible.

Folders and Typescript file names should be `kebab-case`. Ex: `/apps/server/repositories/wiki-articles-repository.ts`

## Testing

Where possible, use Property-Based Testing (PBT) with Effect Schema and its arbitraries integration with fast-check. These tests better explore the state space.

Avoid writing tests that are simply a re-statement of the promises already in the code. You can write trivial tests to help guide your implementation, but don't keep them around if all they do is assert obvious behavior that can't go wrong.

- **Every `*.test.ts` runs in `pnpm run check`.** Projects collect tests by glob and `check-test-inventory` fails if a file isn't collected. Tests that call real external services (LLMs, third-party APIs) are named `*.external.test.ts` and run with `pnpm --filter @gororobas/server test:external`.
- **Features are the spec.** Each `apps/server/test/<name>.feature` pairs with `<name>-feature.test.ts`; `pnpm run check-bdd` only counts steps bound in the paired file. Register steps with literal `Given`/`When`/`Then` patterns: the static checker can't read computed ones.
- **HTTP-level scenarios** use `ApiTestClient` (`apps/server/test/api-test-client.ts`): the production `ApiLive`, workflows and real email sign-in, in process. Scenarios on a `TestClock` must call `startTestClockAtRealTime` before creating data the API reads, because sign-in checks the database clock.
- **New endpoints need a smoke request** in `apps/server/test/api-smoke.test.ts`, which calls every endpoint as each seeded persona and fails on undeclared statuses (such as a placeholder handler's 500) or bodies that don't decode.
- **Workflows** are tested by providing `WorkflowEngine.layerMemory`, the workflow's layer and stub services, then calling `Workflow.execute`. Activity errors must be serializable schemas, or failures are masked as "Expected JSON value".
- **Property failures** print a replay token; pass it as `options: { replay: "…" }` to reproduce the exact case.

## Running the app with data

In a fresh checkout, run `pnpm --filter @gororobas/server setup:env` once. Then start the `api-seeded` and `web-seeded` configurations from `.claude/launch.json` (web app on http://localhost:4543): the API boots with an in-memory database seeded with fake data, so every restart is clean and nothing touches `gororobas.db`. Sign in as `admin@`, `moderator@`, `community@`, `newcomer@` or `blocked@gororobas.test` and read the code from Mailpit's API, or run `pnpm --filter @gororobas/server dev:sign-in community@gororobas.test --api http://localhost:4100 --origin http://localhost:4543` to get a session cookie for curl. `API_PORT`, `WEB_PORT` and `AUTH_ORIGIN` let several stacks run side by side. Details are in the server README's "Fake data" section.

When you add a table, column or wiki kind, extend the seed in `apps/server/src/seed/`; `apps/server/test/seed.test.ts` fails until every table is covered.

## Domain notes

- There are no tags: themes and practices (permaculture, land access…) are CONCEPT wiki articles. Wiki articles link to each other through `wiki_article_relations`, and publications link to wiki articles through `publication_wiki_articles`. Links are derived, never edited by hand, and stored one row per source (`LinkSource` in `packages/domain/src/links/`) with the evidence of where they were established: `ENTITY_REFERENCE` (an `entityReference` node a contributor placed, projected with the content), `MENTION` and `INFERENCE` (found by link inference in `apps/server/src/link-inference/`: the content names the article, or is about it without naming it) and `LEGACY_TAG` (imported from the legacy database).
- Every rich-text node except `doc`, `text` and `hardBreak` has a `nodeId` unique within its document: `NodeIdExtension` assigns them while editing, and `assignTiptapNodeIds` on every CRDT write. Link evidence points at nodes by ID, and machine translations keep their source's node IDs.
- Publications, publication comments and media assets share one moderation lifecycle (`packages/domain/src/moderation/`): approved by default, censored or reapproved by people with `content:moderate`. While censored, content is hidden from every reader except its authors, and media leaves the galleries it's attached to.
- `GET /moderation/queue` lists pending reviews (newcomers awaiting approval, wiki revisions awaiting evaluation), oldest first and unassigned.

## Ensuring quality

⚠️ **CRITICAL**: always run the following to ensure your contribution is correct:

`pnpm run quality-gates`

It runs `pnpm run fix` (format and lint with auto-fixes) and then `pnpm run check`, the non-mutating gate CI runs: formatting, type checks, lint, every test, paired BDD coverage and the test inventory. Run `pnpm run check` alone to verify without changing files.

`.claude/settings.json` formats files after each edit and type-checks changed TypeScript before Claude stops.
