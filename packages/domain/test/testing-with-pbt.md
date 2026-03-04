# Property-Based Testing with Effect + FastCheck

## Setup

```ts
import { describe, it } from "@effect/vitest"
import { Arbitrary, Effect } from "effect"
import { assertPropertyEffect, propertyWithPrecondition, runPolicySuccess } from "./policy-test-helpers.js"
```

Use `it.effect` from `@effect/vitest` for all effectful tests.

## Deriving Arbitraries from Schema

Always prefer `Arbitrary.make(SomeSchema)` over hand-built arbitraries — it covers edge cases and stays in sync with schema changes.

```ts
const sessionArbitrary = Arbitrary.make(Session)
const accountSessionArbitrary = Arbitrary.make(AccountSession)
const visibilityArbitrary = Arbitrary.make(InformationVisibility) // not FastCheck.constantFrom(...)
const personIdArbitrary = Arbitrary.make(PersonId)
```

## Core Helpers

- **`assertPropertyEffect(arbitrary, predicate)`** — runs a property test where the predicate returns `Effect<boolean>`. Fails with counterexample.
- **`propertyWithPrecondition(arbitrary, precondition, predicate)`** — filters the arbitrary by a sync precondition, then asserts. Use to restrict input space (e.g., "only moderators").
- **`runPolicySuccess(policyEffect, session)`** — runs a policy with a session, returns `Effect<boolean>` (`true` = allowed).

## PBT Patterns

### 1. Denial Invariants (Negative Properties)

_"For all X satisfying P, the action is **denied**."_

```ts
it.effect("newcomers cannot create vegetables", () =>
  propertyWithPrecondition(accountSessionArbitrary, isNewcomer, (session) =>
    Effect.map(runPolicySuccess(Policies.vegetables.canCreate, session), (allowed) => !allowed),
  ),
)
```

### 2. Policy Implications (If A Then B)

_"For all sessions: if allowed(X) then allowed(Y)."_ The property `!A || B` encodes logical implication (A ⟹ B). It only fails when A is true but B is false.

```ts
it.effect("canEdit implies canView", () =>
  assertPropertyEffect(accountSessionArbitrary, (session) =>
    Effect.gen(function* () {
      const post = createTestPost(session.personId)
      const canEdit = yield* runPolicySuccess(Policies.posts.canEdit(post), session)
      const canView = yield* runPolicySuccess(Policies.posts.canView(post), session)
      // Logical implication: if canEdit then canView must also hold
      return !canEdit || canView
    }),
  ),
)
```

### 3. Access Level Monotonicity

_"Higher access levels never lose permissions."_ Build sessions at two access levels for the same action and assert the higher level is at least as permissive.

### 4. Universal Properties (No Precondition)

_"For **all** sessions (including visitors), this holds."_ Use `sessionArbitrary` (which includes visitors) with `assertPropertyEffect`.

## Pitfalls

- **Don't write example-based tests with PBT machinery.** If your predicate ignores the generated input, you're running a single example 100 times.
- **Preconditions should be cheap.** `propertyWithPrecondition` uses `.filter()` — expensive predicates cause slow tests or max-skips.
- **Negate for denial.** Return `!result` inside the predicate. Don't `expect(...).toBe(false)`.
- **Derive, don't construct.** Prefer `Arbitrary.make(Schema)` over `FastCheck.constantFrom`. It stays in sync with schema changes.
