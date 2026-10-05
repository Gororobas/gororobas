Review this Effect framework for concrete defects, not style.

- Public asynchronous operations return `Effect` or `Stream`; expected failures stay typed in `E`, requirements stay visible in `R`, and resources belong to `Scope`.
- Effect `Schema` owns persisted and transported values. Decode untrusted data at the boundary; do not cross it with assertions.
- Concrete Layers and platform choices belong at composition roots. Core domain modules cannot import Node assumptions or outward packages.
- Authentication contracts sit inside strategies and adapters; consumer examples are leaf workspaces. Applications own identity and transaction authority.
- Credential delivery stays private. Untrusted provider values and emails never authorize identity selection by themselves.
- Never claim exactly-once external effects or retry an ambiguous credential issuance or OAuth exchange. Durable receipts and original command identities own safe replay.
- Bound concurrency and use structured Effect concurrency. Security decisions fail closed; caller payloads and provider claims are untrusted.
- Flag a new abstraction only when deleting it would remove real ownership, policy, or behavior.
- Default to no new test automation. Require a concrete uncovered failure and a reason existing checks or direct workflow evidence are insufficient before accepting new tests, fixtures, assertions or matrix growth. A current incident, provenance link or authentication-library label alone is insufficient. Never request post-implementation unit tests or a larger integration/E2E substitute for unnecessary tests. Read `.agents/skills/testing/SKILL.md`; do not request speculative cleanup or unrelated hardening.

## Dependencies passed as parameters

Treat dependency drilling introduced or extended by the diff as an actionable architecture defect, not a style nit. Inspect changed function signatures, options objects, and helper factories for service instances, clients, stores, runtime bindings, or effectful callbacks passed as dependencies. A single dependency parameter counts; it need not be a large `deps` bag or pass through multiple helpers.

- Operations acquire required services with `yield* Service`, keeping requirements visible in `Effect` or `Stream`'s `R` channel. Flag helpers that take a service as an argument even when their caller yielded it first. Moving the same dependency into an options object or factory closure does not fix the problem.
- Recommend the existing service or inward port, with concrete implementations provided at the composition root. Do not introduce a wrapper service solely to hold a dependency bag.
- Keep request/domain data and pure transformation callbacks as explicit arguments. Layer configuration and foreign runtime values entering an adapter's construction boundary are legitimate. A service implementation may acquire dependencies during Layer construction and close over them when those requirements remain visible in the Layer's input type. These exceptions do not justify passing services through business operations or internal helpers.
- Cite the changed parameter and its use, explain the requirement hidden from `R` and the caller burden, and name where the dependency should be yielded or provided. Report dependency drilling as P1, a merge-blocking architecture contract violation: it bypasses Effect's requirement tracking and Layer composition. Working runtime behavior does not lower its priority. No production crash or separate behavioral failure is required. Do not audit unrelated pre-existing signatures.

Severity: dependency drilling is explicitly P1 as defined above. For other findings, blocking only for a real ship-stopper; important for an actionable non-blocking defect; nit sparingly. Prefer no finding to a weak one.
