---
'foldkit': minor
'@foldkit/devtools': patch
'@foldkit/devtools-mcp': patch
'create-foldkit-app': patch
---

Make external DevTools Message dispatch an explicit Program option. Replace a root Message Schema passed by hand:

```ts
Program.make({
  block: ApplicationBlock,
  container,
  devTools: { Message: ApplicationBlock.Message },
})
```

with the dispatch opt-in:

```ts
Program.make({
  block: ApplicationBlock,
  container,
  devTools: { dispatch: true },
})
```

Program now derives the dispatch Schema from the completed root Block, including generated envelopes for registered child Blocks. Omitting `devTools`, passing an empty object, or leaving `dispatch` false keeps development inspection enabled while Message Schema discovery and external dispatch remain disabled. `devTools: false` still disables DevTools entirely.

When the completed root Message Codec needs Services for decoding, `dispatch: true` carries them into the Program's requirements. Supply any remaining decoding Services through `program.provide(...)`. The dispatch opt-in does not provide those Services, and leaving dispatch disabled adds no Message decoding requirements. MCP dispatch remains limited to payloads the bridge can represent at its JSON transport boundary.

New projects opt into external dispatch in their generated browser entry.

Remove imports of the old loose root-authoring types from `Runtime`: `ApplicationConfig`, `ApplicationConfigWithFlags`, `RoutingApplicationConfig`, `RoutingApplicationConfigWithFlags`, `ElementConfig`, `ElementConfigWithFlags`, `ApplicationInit`, `RoutingApplicationInit`, `ElementInit`, and `MakeRuntimeReturn`. Root behavior contracts now come from the completed Block and its Composition. Use `Program.Program`, `Program.Element`, and `Program.Runnable` when a public signature needs to describe a browser host value. Server rendering keeps its separate host configuration types.
