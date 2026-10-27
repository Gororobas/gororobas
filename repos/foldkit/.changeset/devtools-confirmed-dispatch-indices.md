---
'foldkit': patch
'@foldkit/devtools-mcp': patch
---

Return confirmed history indexes from external DevTools dispatch instead of predicting them before queued work runs. A batch reports only the Messages actually recorded, in request order; a child Message that becomes stale during the batch contributes no index.

External dispatch rejects Messages configured with `excludeFromHistory` before executing them, so a successful response always identifies a recorded entry. Ordinary application delivery of those Messages remains unchanged. Pending dispatch requests also settle when the runtime crashes or its scope closes.
