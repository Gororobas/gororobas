---
'@foldkit/ui': minor
---

Emit `Menu.OutMessage.Closed()` when an open Menu closes without selecting an item. Parents can now coordinate related state through the Menu Binding's exhaustive OutMessage fold across keyboard, pointer, blur, backdrop, and programmatic close paths.

`Closed` is emitted when the Model changes, before animation and cleanup Commands finish. Selection still emits only `Selected`; closing an already closed Menu emits nothing.

Add the new variant to existing exhaustive Menu folds. Keep the existing selection policy and use a no-op Step when the parent has no response to dismissal.

Component `test` namespaces now consistently expose the original module-level Command and Mount Definitions for Menu, Popover, Listbox, Combobox, Animation, Calendar, Tooltip, HoverIntent, VirtualList, and DragAndDrop. Consumer Story and Scene tests can resolve and assert the same Definitions registered by their completed Blocks. Toast retains its existing instance-specific matchers because its timer Definitions belong to each factory instance.

Before:

```ts
const foldMenuOutMessage = MenuBlock.OutMessage.match({
  Selected: foldSelection,
})
```

After:

```ts
const foldMenuOutMessage = MenuBlock.OutMessage.match({
  Selected: foldSelection,
  Closed: ApplicationDefinition.makeNoopStep,
})
```
