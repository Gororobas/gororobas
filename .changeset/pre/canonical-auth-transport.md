---
"@yielded/auth": minor
---

Use Effect HttpClient Layers for auth transport and bound requests and response bodies with a configurable deadline.

BEHAVIOR CHANGE: Use `AppClient.layerFetch` for Fetch defaults, or provide an HttpClient Layer to direct client acquisition and `AppClient.layer`; replace the `fetch` option with `FetchHttpClient.Fetch` at Layer construction. Atom defaults to `layerFetch`; pass a composed client as `{ layer: ClientLive }` to customize it. Timed-out requests fail with reason `"timeout"` after 30 seconds by default and must not be automatically retried.
