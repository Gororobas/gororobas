# @pleat/foldkit

[Pleat](../../README.md) styles in [Foldkit](https://foldkit.dev) views.

```sh
pnpm add @pleat/core @pleat/foldkit
```

```ts
import { css } from '@pleat/foldkit'

h.button([...attributes.button, ...css(button({ tone: 'Primary' }))], ['Save'])
```

`css(...parts)` takes styles, variable bindings, and `className(...)` for classes Pleat doesn't own, and returns one `Class` attribute and at most one `Style` attribute. Pass everything to one call: Foldkit keeps only the last `Class` an element is given.

Some components take a class name instead of attributes. `@foldkit/ui`'s Menu, Listbox, and Combobox have `buttonClassName`, `itemsClassName`, and an item's `className`. `cssClass(...parts)` merges styles the same way and returns the class string:

```ts
import { cssClass } from '@pleat/foldkit'

itemToConfig: item => ({ className: cssClass(menuItem), content: h.span([], [item]) })
```

For server rendering and static generation, export Pleat's `renderDocument` from your server entry:

```ts
import { renderDocument as renderWithPleat } from '@pleat/foldkit/server'

export const renderDocument = renderWithPleat()
```
