---
'foldkit': minor
---

Add `Program.makeElement` for container-scoped applications. It receives a completed root Block plus container and host options. The Block carries Model, Message, child Bindings, init, update, view, lifecycle declarations, and handler recipes. The Program's `provide` method satisfies ordinary Service requirements before `Runtime.run` or `Runtime.embed` starts it.

**Before**

```ts
import { Runtime } from 'foldkit'
import { Model, init, update, view } from './main'
import { ServicesLayer } from './resources'

const element = Runtime.makeElement({
  Model,
  init,
  update,
  view,
  ports,
  container,
  resources: ServicesLayer,
})

const handle = Runtime.embed(element)
```

**After**

```ts
import { Program, Runtime } from 'foldkit'
import { ApplicationBlock } from './block'
import { ApplicationLayer } from './layer'
import { ports } from './port'

const program = Program.makeElement({
  block: ApplicationBlock,
  ports,
  container,
})

const handle = Runtime.embed(program.provide(ApplicationLayer))
```

Preserve existing Flags and other host configuration. Include local lifecycle declarations and `EffectsLayer` in `ApplicationBlock`. Registered child Bindings contribute their declarations and handler recipes automatically.

Provided variants of one Program share its embed activity and disposal ordering. Only one variant can be embedded at a time, and embedding after disposal waits for the previous Runtime's cleanup.
