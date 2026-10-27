---
'foldkit': minor
'create-foldkit-app': minor
---

Use an ordinary completed Block as the application root and keep browser host behavior in `Program`.

The root now follows the same Definition → Composition → preparation → Block sequence as every other feature. Create it with `Block.makeDefinition('Application', { Model, Message, ChildInitContext? })`, author init, update, and view through `ApplicationComposition`, prepare the implementation with `ApplicationComposition.prepareBlock({ ... })`, and export the checked `ApplicationBlock = Block.assemble(prepare)`. A root Block cannot leave an OutMessage for its host to discard.

Create the browser host in `entry.ts` with `Program.make({ block: ApplicationBlock, container, Flags?, routing?, ...hostOptions })` for a page-owning app or `Program.makeElement({ block: ApplicationBlock, container, Flags?, flags?, ...hostOptions })` for a container-scoped app. Program configuration contains host behavior only; init, update, view, lifecycle declarations, and `EffectsLayer` remain on `ApplicationBlock`. Supply ordinary Services through `program.provide(ApplicationLayer)`, then pass the result to `Runtime.run`, `Runtime.hydrate`, or `Runtime.embed` as before.

Server rendering shares the same completed root Block without constructing a DOM Program. Call `Server.renderToString(ApplicationBlock, { Flags?, routing? }, { flags?, url?, ...renderOptions })`; the second argument contains server host declarations and the third contains request startup inputs and render options.

For routing Messages with the canonical payloads, pass the completed constructors directly:

```ts
routing: {
  onUrlRequest: ApplicationBlock.Message.ClickedLink,
  onUrlChange: ApplicationBlock.Message.ChangedUrl,
}
```

Callbacks remain supported when a Message needs a different payload shape.

**Before**

```ts
import { Runtime, makeApplicationDefinition } from 'foldkit'

const ApplicationComposition = makeApplicationDefinition({
  Model,
  Message,
}).makeComposition()

const application = ApplicationComposition.assembleApplication({
  init,
  update,
  view,
  EffectsLayer,
  container,
  Flags,
  routing,
})

Runtime.run(application.provide(ApplicationLayer), { flags })
```

**After**

```ts
import { Block, Program, Runtime } from 'foldkit'

const ApplicationComposition = Block.makeDefinition('Application', {
  Model,
  Message,
}).makeComposition()

const prepare = () =>
  ApplicationComposition.prepareBlock({
    init,
    update,
    view,
    EffectsLayer,
  })
export const ApplicationBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)

const program = Program.make({
  block: ApplicationBlock,
  container,
  Flags,
  routing,
})

Runtime.run(program.provide(ApplicationLayer), { flags })
```

Remove `makeApplicationDefinition`, `ApplicationComposition.assembleApplication`, and `ApplicationComposition.assembleElement`. Keep the existing root folder names: `definition.ts`, `composition.ts`, `init.ts`, `update.ts`, and `view.ts`. In a split root, assemble `ApplicationBlock` in `block.ts`; in a compact root, keep it in `application.ts`. Keep `ApplicationLayer` in `services.ts` and let `entry.ts` create and start the Program.
