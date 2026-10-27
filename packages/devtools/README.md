# @foldkit/devtools

The in-browser DevTools overlay for [Foldkit](https://foldkit.dev).

The overlay displays every Message flowing through your app and lets you inspect the Model, Message, Commands, and Mounts at any point in time. Time-travel mode rewinds the UI to any past Model, Inspect mode browses snapshots without pausing the app, and Block drill-in scopes the Message list to a nested module. It renders inside a shadow DOM, so it won't interfere with your styles or layout.

## Installation

```bash
pnpm add --save-dev @foldkit/devtools
# or
npm install --save-dev @foldkit/devtools
# or
yarn add --dev @foldkit/devtools
```

`@foldkit/devtools` lists `foldkit`, `@foldkit/ui`, `effect`, and `@effect/platform-browser` as peer dependencies, so install those alongside it.

## Usage

With `@foldkit/vite-plugin`, installing this package as a development dependency is enough to mount the overlay during development. The plugin leaves it out of production builds:

```typescript
// src/entry.ts
import { Program, Runtime } from 'foldkit'

import { ApplicationBlock } from './application'

const program = Program.make({
  block: ApplicationBlock,
  container: document.getElementById('root'),
  devTools: { dispatch: true },
})

Runtime.run(program)
```

The application root is an ordinary Block created with `Block.makeDefinition('Application', { Model, Message })`. Author its implementation through `ApplicationComposition`. Call `prepareBlock` inside a private `prepare` function, then export `ApplicationBlock` with its matching `FromAssembly` annotation and `Block.assemble(prepare)`. Pass that Block to `Program.make` in the entry point.

The `devTools` configuration is optional. Development inspection is enabled by default, while external Message dispatch is disabled. Set `dispatch: true` when the [DevTools MCP server](https://foldkit.dev/ai/mcp) should discover and dispatch the completed root Block's Messages. Foldkit derives that Schema from `ApplicationBlock`, including the generated envelopes for registered child Blocks.

To include the overlay in production, move `@foldkit/devtools` to regular `dependencies` and set `show: 'Always'`. The dependency section is the build-time opt-in, and `show` controls whether the Runtime mounts it:

```typescript
const program = Program.make({
  block: ApplicationBlock,
  container,
  // ...
  devTools: {
    show: 'Always',
  },
})
```

See the [DevTools documentation](https://foldkit.dev/core/devtools) for the full configuration surface.

## License

MIT
