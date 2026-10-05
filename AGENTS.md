# Learning more about the Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.

# Effect Atom client boundary

Effect Atom owns client queries, mutations, shared state, and workflows.
Keep business logic in Effect: compose multi-step client workflows as atoms,
declare cross-query invalidation as reactivity keys on mutations, and keep
promise-mode dispatches at the React boundary logic-free — no `.then` chains
in components or routes.

## Project command policy

Vite+ is the unified toolchain and command authority for this repository. It wraps Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task behind the `vp` CLI; Vite+ is distinct from Vite.

Run `vp help` for available commands and `vp <command> --help` for command-specific options. Documentation is available locally in `node_modules/vite-plus/docs` and online at https://viteplus.dev/guide/.

Use these repository commands:

- Install dependencies: `vp install`.
- Full handoff gate: `vp run ready`.
- Repository static and export checks: `vp run check`.
- Static checks: `vp check`.
- Format check: `vp fmt --check`; format fixes: `vp fmt`.
- Lint only: `vp lint`; lint fixes: `vp lint --fix`.
- Tests only: `vp test`.
- Other repository tasks and package scripts: `vp run <task>`.
- Toolchain or runtime troubleshooting: run `vp env doctor` and include its output when asking for help.

Do not use `bun run`, `npm run`, `pnpm run`, or `yarn run` in this repository. Do not invoke underlying tools such as `tsc`, `vitest`, `oxlint`, or `oxfmt` directly; use the Vite+ entry points above.

# Instructions for implementation agents

This repository is designed to be implemented by a large, parallel AI-assisted project. Every
agent must preserve a common domain language, dependency direction, and durability contract.

## Required reading

Before editing code:

1. Read `README.md`.
2. Read `GLOSSARY.md` when changing domain concepts or public terminology.
3. Read `docs/TOOLCHAIN.md`.
4. Read the relevant guide, API comments, and neighboring tests for the modules in scope.
5. Read `node_modules/effect/AGENTS.md` before writing Effect code (the canonical Effect
   guidance; `.agents/skills` carries the focused task skills).
6. Read `.agents/skills/effect-development/references/cli/index.md` before creating or
   changing repository scripts.
7. Inspect neighboring package tests before introducing a new pattern.

Keep user-facing behavior in existing guides, implementation contracts beside the code, and
verification evidence in the task or PR artifacts. Explain change rationale in the pull request.
Do not commit separate specifications, planning documents, decision registers, ADRs, roadmaps,
or investigation logs to the product repository.

## Documentation

Write documentation for humans learning how the library works and how to use it.
Keep it terse: explain the mental model, how pieces fit, and essential usage.
Make code self-documenting through clear names, types, schemas, and structure;
agents can read the implementation.

- Use small diagrams and code snippets only when they clarify ownership or usage.
- Put detailed options, defaults, and API behavior in scannable reference pages.
  Link to runnable examples for complete setup.
- Keep implementation contracts in source, schemas, and API comments.
- Keep crucial caveats beside the relevant concept; link to reference details.
- Edit the page as a whole. Do not append feature inventories, change histories,
  or long defensive explanations to an otherwise focused guide.
- Use `bun add` for consumer package installation examples.
- Draw architecture flows with `FlowMap` and request sequences with `Trace` from
  `@yielded/starlight-theme/components`, in an `.mdx` page. Give each `FlowMap` a
  `title` and `description`; the shared theme owns layout, ownership colors, and theming.
- Never hardcode Effect's current version in documentation, including READMEs,
  guides, reference pages, contributor docs, and installation commands. Use plain
  `effect` without a version or release tag in install examples. Package manifests
  and the root catalog own exact versions and peer compatibility; refer to them
  instead of repeating version numbers in prose or tables.

## Non-negotiable architecture rules

1. Public asynchronous operations return `Effect` or `Stream`, not naked `Promise` values.
2. Expected failures remain typed in `E`; dependency requirements remain visible in `R`.
3. Effect `Schema` is the canonical source for persisted and transported values.
4. Every acquired resource belongs to `Scope`. The library must not create daemon fibers.
5. Security decisions fail closed. Credentials, provider claims, and caller payloads are untrusted.
6. Private credential delivery stays outside public operation results and telemetry.
7. No code may claim exactly-once external side-effect execution. Unknown commit outcomes do
   not authorize repeating credential issuance or provider exchange.
8. Concurrency is bounded and uses Effect structured concurrency.
9. Node platform assumptions must not enter core domain modules.

## Designing strategies

Strategy constructors configure behavior; default to `make()` where possible and derive
identities from the Auth definition. Supply storage, delivery, secrets, and provider config
through required services and Layers. Optional rendering uses a defaulted service.
Adapter Layers require their config and platform services; keep every dependency visible in `R`.
Do not add strategies or constructor callbacks merely to forward service dependencies.
Guides show concrete Layer construction and distinguish library defaults from application policy.

## Package dependency direction

```text
identity and operation contracts <- authentication strategies <- persistence/protocol adapters
public @yielded/auth modules <- consumer examples
```

An inward module must not import an outward adapter. Define or deepen an inward port and
implement an outward adapter when necessary. Applications own subject identifiers, account
provisioning, transaction authority, policy, and delivery.

Framework code lives in `packages/*`; do not create an `apps/` workspace. Runnable consumer
examples live in `examples/*`, remain leaf workspaces, and import the package's public modules.
Internal adapter fixtures remain under the owning package's `test/fixtures`. Create a new
framework package only for a new concern agreed with the repository owner.

## Toolchain rules

- Bun `1.4.2` is the package manager. Use `catalog:` for shared dependencies and `workspace:*`
  for repository packages.
- The root catalog is the single source for the exact Effect version. Do not pin Effect
  independently in a package.
- After changing an Effect-family version, run `vp install` and `vp run check`.
- Contributor skills under `.agents/skills` are repo-owned. Dev Kit copies track their source
  in a `.dev-kit-origin.json` receipt. Check for upstream updates with
  `bunx @danieljvdm/dev-kit@latest skills status`, and fast-forward an unmodified skill with
  `bunx @danieljvdm/dev-kit@latest skills update <name>`; a skill with local edits is left for an
  agent merge instead of being overwritten. Add a new skill from the approved catalog with
  `bunx @danieljvdm/dev-kit@latest skills add <name>`.
- Contributor agent skills are repository tooling. They are not runtime Skill definitions and
  must not be imported by `@yielded/auth`.
- Before handoff, run `vp run ready`.

## Change discipline

- Add or update Effect Schema definitions before implementing new wire or persisted values.
- Use the [simplify skill](.agents/skills/simplify/SKILL.md) to consider removing unnecessary
  mechanisms within the affected workflow. Preserve required public contracts, authority,
  validation, and retry guarantees; complexity alone does not justify unrelated cleanup.
- Update existing guides or API comments when a change affects their documented behavior.
- Explain rejected alternatives in the pull request when a future agent could reasonably
  re-propose them.
- Do not silently widen errors to `unknown`, `Error`, or `any`.
- Do not use type assertions to cross a schema boundary.
- Yielded Auth is pre-production. Keep one current implementation per workflow; update internal
  contracts in place and remove superseded aliases or migration shims. Prefer resetting affected
  development data and state the reset scope. External contracts require explicit compatibility.
  Preserve authorization, validation, durable identities, and receipts needed for safe retries.
- Write changesets as one or two imperative sentences naming the consumer-visible change. Add only
  a short usage example or an explicit BEHAVIOR CHANGE note when consumers must act; keep IDs,
  root-cause, review and test stories, and implementation mechanics in the pull request.

## Testing policy

Default to no new tests or test infrastructure. Verify requested behavior with
existing checks and direct workflow evidence. Prefer E2E for complex features;
this does not require writing an E2E suite or a larger substitute for a rejected
unit test. Save a verifiable, repeatable artifact without building reporting
machinery.

Never write unit tests after implementation. If isolation is necessary, first
write the scoped failure inventory, then the necessary failing tests, then the
code. New or expanded committed automation requires a current regression or an
explicit human test request, plus a concrete gap existing proof cannot cover.
Being an authentication library does not waive this bar or require a scenario matrix.

Load the [testing skill](.agents/skills/testing/SKILL.md) before planning proof
or adding, retaining, or removing tests. It owns selection, failure-first
isolation, artifacts, evidence reuse and placement. Keep useful public-contract,
credential, recovery and authority checks at their strongest boundary; remove
redundant matrices and implementation mirrors. The final `vp run ready` gate still applies.

## Parallel work

Parallel agents must own disjoint packages or documents. Shared domain schemas, error unions,
authentication records, and public exports require one designated integrator.
Review the combined diff and run `vp run ready`. Add focused verification only
for a concrete remaining question; do not automatically repeat successful
adapter, schema or crash suites.

## Completion standard

Finish when the requested observable outcomes have sufficient evidence, relevant
public contracts and operational limitations are documented, and `vp run ready`
passes. Choose failure, interruption, resource, recovery and security checks for
concrete risks in the change; this is not a mandatory scenario matrix. Preserve
blocked required proof explicitly. A new source file, state transition or public
API does not imply a new test file.

## Repository boundaries

`main` requires a pull request and the `ready` check. Use
[open-pull-request](.agents/skills/open-pull-request/SKILL.md) for concise PR descriptions.
Include diagrams only for meaningful architecture changes and code examples only
when they clarify the change. When green and approved for landing, squash and delete the branch without
bypassing checks. Bring main into a branch only to resolve a real conflict.

Keep package READMEs to purpose, ownership, and non-obvious constraints. Code, schemas,
configuration, and command help own implementation details; investigations belong in issues or
pull requests. Do not patch owned dependencies in this consumer; fix and release their owners.
