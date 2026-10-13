# @pleat/core

The algebra behind [Pleat](../../README.md): styles as values, compiled to atomic CSS when your modules load.

```sh
pnpm add @pleat/core effect
```

| Module           | What it does                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Style`          | Declarations under conditions. An idempotent monoid under `merge`, with `Style.Reducer` for Effect.                                      |
| `When`           | Conditions: interaction, `@foldkit/ui` states, media and container queries, relations to marked elements. Totally ordered by precedence. |
| `Recipe`         | Variant families typed by Effect Schema, with `Recipe.jsonSchema` for structured output.                                                 |
| `Var`            | Typed custom properties for values that change continuously.                                                                             |
| `Token`, `Theme` | Design tokens with kinds, and themes whose values are checked against them.                                                              |
| `Global`         | Element rules, themes at selectors, font faces, keyframes.                                                                               |
| `Sheet`          | The stylesheet: render it on the server, insert it lazily in the browser.                                                                |
| `Calc`, `Color`  | Value helpers that compile to `calc()`, `color-mix()`, and relative colors.                                                              |

Every export has TSDoc. The docs site's reference page lists them all.
