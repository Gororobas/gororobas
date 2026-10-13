# Pleat

Algebraic, typed styles for [Foldkit](https://foldkit.dev) and [Effect](https://effect.website) v4.

Styles in Pleat are values. You merge them, nest them under conditions, and vary them by your Model, and the laws you'd expect hold. Every rule compiles to atomic CSS when your modules load, so a view only picks among finished styles: a recipe call is a few map lookups, server-rendered pages ship only the CSS they use, and a language model generating your interface can choose styles but never write CSS.

```ts
import { Recipe, Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

const card = Style.make({ display: 'grid', gap: 12, padding: 20 }).pipe(
  Style.when(When.hover, { boxShadow: '0 8px 24px -12px rgb(0 0 0 / 0.3)' }),
)

const badge = Recipe.make({
  variants: { status: { Draft: { color: 'gray' }, Live: { color: 'green' } } },
})

const postView = (post: Post, h: HtmlBuilder<Message>): Html =>
  h.article(
    [...css(card)],
    [
      h.h2([], [post.title]),
      h.span([...css(badge({ status: post.status }))], [post.status]),
    ],
  )
```

## Packages

| Package                              | What it is                                                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@pleat/core`](packages/core)       | The algebra: `Style`, `When`, `Recipe`, `Var`, `Token`, `Theme`, `Global`, `Sheet`, `Calc`, `Color`. Depends only on Effect.                                                                    |
| [`@pleat/foldkit`](packages/foldkit) | `css()` for Foldkit views, `cssClass()` for `@foldkit/ui` parts that take class names, and a `renderDocument` that puts each page's CSS in its head for server rendering and static generation. |

## What you get

- **Lawful composition.** `Style` is an idempotent monoid under `merge`, exposed as an Effect `Reducer`. Merging reads like object spread, including a shorthand written after its longhands. Equal styles are the same object.
- **Conditions that fit Foldkit.** `When.hover`, `When.focusVisible`, media and container queries, "inside a hovered card", and the states `@foldkit/ui` sets: `When.open`, `When.selected`, `When.disabled`, `When.highlighted`. A fixed precedence order decides what wins when two hold at once, so a disabled button doesn't light up on hover.
- **Variants typed by Schema.** `Recipe.make` takes options per dimension; the props are an Effect Schema and `Recipe.jsonSchema` gives the JSON Schema for structured output.
- **Tokens and themes.** Tokens are custom properties with kinds, in any tree you like; themes are checked values for them, applied by an attribute on any element, so scopes nest. Themes from outside the program are decoded before they become CSS. See [Theming](#theming).
- **No CSS work in render.** `css()` returns cached, frozen attributes for styles it has seen. The browser inserts a style's rules the first time it is used, at their sorted position.
- **Server rendering and static pages.** Class names are hashes of their declarations, so the server and the client compute the same ones and hydration matches.
- **Plays well with Tailwind.** Pleat declares the page's layer order as `theme, base, components, pleat, utilities`. A Tailwind v4 utility on an element beats Pleat's styles, Pleat's styles beat Tailwind's preflight reset and its components layer, and unlayered CSS beats both. This holds when Pleat's style is the page's first stylesheet, as `renderDocument` makes it, and in any order once the client mounts. `className` passes any class token through, Tailwind's arbitrary values and variants included.

## Theming

Tokens come in three layers: a palette, semantic tokens that say what a value is for, such as `surface` or `accent`, and a few component tokens like `button.radius`. Themes fill each layer: light, dark, and high-contrast modes point the semantic colors at the palette, a second brand is `Theme.extend` of the first, and a density points spacing and type at other steps. Components read only semantic tokens, so changing the mode, the brand, or the density changes nothing in a component. A theme from outside the program, such as a customer's brand from a settings API, goes through `Theme.decodePartial`, which checks each value against its token's kind and can run whole-theme rules such as contrast, and `Theme.bindings` applies the result to one element.

```ts
// A second brand overrides only what makes it different.
const orchard = Theme.extend(harbor, palette, {
  brand: shades(345, 0.15),
  radius: { sm: '8px', md: '12px', lg: '20px' },
})

// Dark mode points the semantic colors at other steps of the palette.
const dark = Theme.extend(light, mode, {
  color: { surface: gray[950], text: gray[50], accent: brand[400] },
})

// Each axis is one attribute, on the page or on any element inside it.
Global.theme(orchard, { selector: '[data-ds-brand="Orchard"]' })
Global.theme(dark, { selector: '[data-ds-mode="Dark"]' })

// A brand from outside the program is checked against each token's kind,
// then bound to one element. Every alias below it follows.
const decodeBrand = (input: unknown) => Theme.decodePartial(Theme.empty, brandKit, input)

h.section([...css(card, ...Theme.bindings(customerBrand))], children)
```

The full page, [`site/src/view/theming.ts`](site/src/view/theming.ts), renders the same card from tokens and from hardcoded values side by side, nests scopes three deep, and decodes brands you type. Run `pnpm site:dev` and open `/theming`.

## Foldkit UI

[`@foldkit/ui`](https://foldkit.dev) handles behavior and accessibility, and marks each part's state with data attributes. Pleat's `When` conditions select those attributes (`open`, `selected`, `highlighted`, `disabled`, `checked`, `indeterminate`, and the transition states), so a part's states live in its recipe and the view only spreads attributes. Parts that take attributes use `css()`; parts that take class names, such as a Menu's items, use `cssClass()`. Each condition was checked against what `@foldkit/ui` 0.167 renders, and a browser test drives a Menu by keyboard.

```ts
const switchTrack = When.marker('switch')

const track = Style.make({ width: 44, height: 24, backgroundColor: color.line }).pipe(
  Style.merge(Style.mark(switchTrack)),
  Style.when(When.checked, { backgroundColor: color.accent }),
  Style.when(When.disabled, { opacity: 0.5, cursor: 'not-allowed' }),
)

// The thumb has no state of its own. It moves when its track is checked.
const thumb = Style.make({ aspectRatio: '1', backgroundColor: color.surface }).pipe(
  Style.when(When.within(switchTrack, When.checked), { translate: '100%' }),
)

Switch.view(
  {
    id: 'digest',
    isChecked: model.isDigestOn,
    onToggle: isChecked => Message.ToggledDigest({ isChecked }),
    toView: attributes =>
      h.button([...attributes.button, ...css(track)], [h.span([...css(thumb)], [])]),
  },
  h,
)
```

The full page, [`site/src/view/foldkitUi.ts`](site/src/view/foldkitUi.ts), styles eleven components live, lists which condition each part sets, and covers the gotchas: Dialog uses `show()`, so style its `backdrop` part rather than `When.backdrop`, and in a RadioGroup `data-active` marks the tab stop even without focus, so use `When.focusVisible` there. Run `pnpm site:dev` and open `/foldkit-ui`.

## Checked, not just claimed

- Property-based tests check associativity, identity, idempotence, right regularity, the Effect `Reducer`, nested conditions, and that the same declarations always compile to the same classes.
- A Chromium test renders hundreds of random styles under random states (hover and focus-visible forced through the DevTools protocol, dark mode emulated, breakpoints by viewport) and checks every computed value against `Style.resolve`, the function that defines what a style means. It covers the server-rendered sheet and the browser's lazy insertion. Breaking the compiler on purpose (unsorted rules, wrong insertion position, unequal specificity) makes it fail.

## Performance

From [`bench/RESULTS.md`](bench/RESULTS.md), on an AMD Ryzen 5 7640HS with Node 26:

| One styled element per render         |   Time | Relative |
| ------------------------------------- | -----: | -------: |
| Pleat: recipe → `css()`               |  90 ns |     1.0× |
| Pleat: recipe + override → `css()`    | 107 ns |     1.2× |
| cva                                   | 228 ns |     2.5× |
| cva + tailwind-merge with an override | 334 ns |     3.7× |

## The docs site

[`site/`](site) is the documentation: a Foldkit app, prerendered to static pages, styled only with Pleat, with a recipe playground and a generative-interface demo. [`site/alchemy.run.ts`](site/alchemy.run.ts) deploys it to Cloudflare with an [Alchemy](https://alchemy.run) stack. That is the FACE stack: Foldkit, Alchemy, Cloudflare, Effect.

The stack uses [`Cloudflare.Website.Foldkit`](https://alchemy.run/cloudflare/frontend/foldkit/), rooted at `site`, to run the app’s Vite build.
The Cloudflare 404 file is generated by a Vite build hook, so it is included in
both standalone and Alchemy builds.

The site ships [Foldkit DevTools](https://foldkit.dev/core/devtools) in production,
like foldkit.dev does. `@foldkit/devtools` is a regular dependency of `site`, and
`site/src/entry.ts` registers its overlay and sets `show: 'Always'`. The Foldkit
Vite plugin only adds the overlay through Vite's HTML transform, which a prerendered
build with a script entry never runs, so the entry registers it directly. Visitors
get `Inspect` mode, which browses recorded Models without pausing the page;
`pnpm site:dev` gets `TimeTravel`.

## Development

Use Node 22.18 or newer and the pnpm 12.10.1 release pinned in `package.json`.
Install that version with `npm install --global pnpm@12.10.1` if needed.

```sh
pnpm install
pnpm format          # oxfmt, including displayed snippets
pnpm lint            # oxlint across the repo, plus Foldkit rules for the site
pnpm typecheck       # libraries, site and its stack, benchmark, and browser tests
pnpm test            # unit and property tests
pnpm chromium:install # download Playwright's Chromium once
pnpm test:browser    # the Chromium cascade test (set CHROMIUM_PATH if Playwright's isn't installed)
pnpm bench           # the render benchmark
pnpm site:dev        # the docs site with hot reload
pnpm site:build      # the static site in site/dist/client
pnpm site:setup      # connect Cloudflare once, then approve login in your browser
pnpm site:deploy     # deploy the docs to the production stage
pnpm check           # all of the above that CI runs
```

The root owns shared tooling: oxfmt, oxlint, TypeScript, Vite, and Vitest.
Formatting and linting run in `pnpm check` and CI. The formatter preserves the
narrower widths of displayed snippets and uses Foldkit’s import ordering.

`bench` and `test/browser` are private packages with their own manifests and
TypeScript configs, so comparison and browser-fixture packages stay with the code
that uses them. The docs own their deployment: `site/alchemy.run.ts` is the stack,
and Alchemy and the Node platform are site devDependencies. One root install and
lockfile cover everything, and site typechecking includes the stack. The Node
platform matches the site’s pinned Effect version.

### Agent setup

Follow [Foldkit's AI guidance](https://foldkit.dev/ai/overview). `repos/foldkit` is a
read-only git subtree at `foldkit@0.167.0`, matching the installed framework. It
provides the source, examples, documentation, and upstream skills in a normal
clone. `FOLDKIT.md` is copied unchanged from that release's scaffolder template;
Pleat-specific instructions live in `AGENTS.md`.

Foldkit's `foldkit`, `generate-program`, and `audit-program` skills are symlinked
into `.agents/skills` for Codex and OpenCode and `.claude/skills` for Claude Code.
The project-local Effect skill is committed alongside them. Invoke `$foldkit` or
`$audit-program` in Codex, or `/foldkit` or `/audit-program` in Claude Code.

`.mcp.json` launches the site's pinned `@foldkit/devtools-mcp` package through
pnpm. With `pnpm site:dev` running and the app open in a browser, an MCP-enabled
agent can inspect the Model and Message history. The recommended Foldkit lint
rules run through `pnpm lint` and CI.

After upgrading the site's Foldkit packages, update both reference snapshots:

```sh
git subtree pull --prefix=repos/foldkit https://github.com/foldkit/foldkit.git \
  "foldkit@$(node -p "require('./site/node_modules/foldkit/package.json').version")" --squash
cp repos/foldkit/packages/create-foldkit-app/templates/base/FOLDKIT.md FOLDKIT.md
```

The skill symlinks follow the updated subtree automatically. `repos/` is excluded
from workspace package discovery, formatting, and the editor file tree. Import
framework code through the installed npm packages.

### Deploy the docs

Run these from the repository root:

```sh
pnpm install
pnpm site:setup
pnpm site:deploy
```

Setup connects Cloudflare to Alchemy’s default profile. Choose OAuth and Basic
Scopes, approve the login in your browser, and select the Cloudflare account. Credentials stay in
Alchemy’s local profile; nothing goes in the repository. Setup is only needed
once per machine. The deploy command explicitly selects `prod`, matching the
Deploy workflow.

The stack names the Worker `pleat-docs` and serves it at
[`pleat.manzanita.dev`](https://pleat.manzanita.dev). Alchemy manages the custom
domain’s DNS record and TLS certificate in the existing `manzanita.dev` zone.

The Deploy workflow runs the same stack from GitHub Actions. It needs
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as Actions secrets. With
`CI=true`, Alchemy reads those two variables and never touches a profile. The
workflow runs `alchemy provider check-env` first, so a missing secret fails in
seconds with its name, then `pnpm --dir site run deploy:ci`, which is the deploy
with `--yes`. The flag matters: Alchemy keeps its state in a Worker it deploys to
the account, the Cloudflare State Store, and without a terminal it refuses to
bootstrap or upgrade that Worker unless told yes.

#### CI credentials

[`site/github.run.ts`](site/github.run.ts) is a second stack that mints the
token and writes both secrets, following Alchemy's
[CI guide](https://alchemy.run/environments/ci/). The token is scoped to what the
deploy does: on the account, Workers Scripts Write, Secrets Store Write, Account
Settings Read, and Workers Tail Read, for the docs Worker and the state store; on
the `manzanita.dev` zone only, Zone Read, Workers Routes Write, DNS Write, and SSL
and Certificates Write, for the custom domain.

Minting a token needs more than the everyday profile has, and Alchemy's Cloudflare
OAuth login has no scope for it, so the stack deploys from a separate `admin`
profile backed by the Global API Key:

```sh
pnpm --dir site exec alchemy profile create admin
pnpm --dir site exec alchemy profile edit --profile admin --add Cloudflare
GITHUB_TOKEN="$(gh auth token)" pnpm site:secrets
```

In the second command choose "API Token or API Key" and paste the Global API Key
with the account email. The third command writes `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` as repository secrets through the `gh` login, which needs
the `repo` scope and admin rights on the repository. Repository secrets take
precedence over organization secrets of the same name. Run `pnpm site:secrets`
again to rotate the token or change its permissions, then run the Deploy
workflow.

The workspace applies a one-line patch to Alchemy 2.0.0-beta.81’s published
profile dashboard, restoring the JSX runtime specified by its source. React is
not needed. Remove the patch when upgrading to a release that fixes that import.

## License

MIT
