---
'foldkit': minor
---

Remove `Runtime.makeApplication` and `Runtime.makeElement`, including their `resources` configuration field. Create the root through `Block.makeDefinition('Application', { Model, Message })`, then create `ApplicationComposition` with `makeComposition(...)`, prepare its implementation with `prepareBlock(...)`, and assemble `ApplicationBlock` with `Block.assemble(prepare)`. Retain `ApplicationDefinition` as a named value when its authoring methods are used; when its only use is `makeComposition`, chain both top-level calls directly. Create the host through `Program.make` or `Program.makeElement`, then supply application-lifetime Services through `program.provide(layer)` before calling `Runtime.run`, `Runtime.hydrate`, or `Runtime.embed`.

The Block and Program methods are factories: they return passive values and do not execute application behavior. Only the Runtime starts the Program.

The completed Block captures Model, Message, child Bindings, Mount capabilities, init, update, view, lifecycle declarations, and handler recipes. Program configuration adds only host behavior. Remaining Service requirements must be satisfied before the Program can start.

Application Layers build eagerly once for each runtime start and release when that runtime stops. They are available to Flags, Commands, Subscriptions, Mounts, and ManagedResources. This differs from the removed `resources` field, which deferred construction until Flags, a Command, or a Subscription first requested its services. An application Layer build failure stops startup before the first render, where no Model exists for a crash view.

`Runtime.hydrate` validates the server build identity and Flags payload before acquiring application Layers. A refused handoff contains the served page before any application Layer can start work or fail to build.
