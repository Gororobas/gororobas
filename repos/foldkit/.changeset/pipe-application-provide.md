---
'foldkit': minor
---

Move application Layer provision onto completed Programs. Remove the standalone `provide` export from `foldkit/application`.

Create the Program with `Program.make(...)` or `Program.makeElement(...)`, then call its `provide` method:

```ts
// Before
import { provide } from 'foldkit/application'

Runtime.run(provide(application, ApplicationLayer), { flags })

// After
Runtime.run(program.provide(ApplicationLayer), { flags })
```

Use `program.provide(ApplicationLayer)` for both page-owning and element-scoped Programs. Blocks and Compositions do not own application Service provision.

Each `provide` call returns a new passive program. It removes the Layer's outputs from the program's unmet Service requirements, carries the Layer's own requirements forward, and preserves an Application's Flags contract. Extra Layer outputs remain available to Flags and other runtime Effects. Calls may be chained; provide a dependent Layer before the Layer that satisfies its requirements. The Runtime builds the accumulated Layers only when it starts the resulting program.
